alter table public.profiles
  alter column country_residence set default 'Bangladesh',
  alter column currency_preference set default 'BDT';

update public.profiles
set country_residence = 'Bangladesh',
    currency_preference = 'BDT',
    shop_id = coalesce(shop_id, (select id from public.shops order by created_at asc limit 1))
where role = 'Cashier'
  and lower(coalesce(full_name, '')) = 'mahmud'
  and (country_residence = 'Malawi' or currency_preference = 'MWK' or shop_id is null);

create or replace function public.complete_sale(p_sale jsonb, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_shop_id uuid;
  v_customer_id uuid;
  v_session_id uuid;
  v_role text;
  v_profile_name text;
  v_profile_shop_id uuid;
  v_sale_id uuid;
  v_created_at timestamptz;
  v_total numeric := 0;
  v_line_total numeric;
  v_quantity integer;
  v_product_id uuid;
  v_service_id uuid;
  v_product_shop uuid;
  v_cost_price numeric;
  v_item jsonb;
  v_remaining integer;
  v_previous integer;
  v_new integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if p_sale is null or jsonb_typeof(p_sale) <> 'object'
     or p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'Sale must include at least one item';
  end if;

  v_shop_id := nullif(p_sale->>'shop_id', '')::uuid;
  if v_shop_id is null then
    raise exception 'Shop is required';
  end if;

  select role, full_name, shop_id
    into v_role, v_profile_name, v_profile_shop_id
  from public.profiles
  where id = v_user_id;

  if v_role not in ('Owner', 'Manager', 'Cashier') then
    raise exception 'Valid shop account required';
  end if;

  if not exists (
    select 1 from public.shops s
    where s.id = v_shop_id
      and (s.owner_id = v_user_id or v_profile_shop_id = s.id)
  ) then
    raise exception 'Not authorized for this shop';
  end if;

  v_customer_id := nullif(p_sale->>'customer_id', '')::uuid;
  if v_customer_id is not null and not exists (
    select 1 from public.customers c
    where c.id = v_customer_id and c.shop_id = v_shop_id
  ) then
    raise exception 'Customer does not belong to this shop';
  end if;

  v_session_id := nullif(p_sale->>'session_id', '')::uuid;
  if v_session_id is not null and not exists (
    select 1 from public.employee_sessions es
    where es.id = v_session_id
      and es.employee_id = v_user_id
      and es.shop_id = v_shop_id
      and es.status = 'active'
  ) then
    v_session_id := null;
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_quantity := nullif(v_item->>'quantity', '')::integer;
    if v_quantity is null or v_quantity < 1 then
      raise exception 'Item quantity must be positive';
    end if;

    v_product_id := nullif(v_item->>'product_id', '')::uuid;
    v_service_id := nullif(v_item->>'service_id', '')::uuid;
    if (v_product_id is null) = (v_service_id is null) then
      raise exception 'Each sale item must be one product or service';
    end if;

    if v_product_id is not null then
      select p.shop_id, p.cost_price into v_product_shop, v_cost_price
      from public.products p where p.id = v_product_id for update;
      if v_product_shop is distinct from v_shop_id then
        raise exception 'Product does not belong to this shop';
      end if;
      v_line_total := coalesce(nullif(v_item->>'unit_price', '')::numeric, 0) * v_quantity;
      v_total := v_total + v_line_total;
    else
      if not exists (
        select 1 from public.services s
        where s.id = v_service_id and s.shop_id = v_shop_id and s.is_active
      ) then
        raise exception 'Service does not belong to this shop';
      end if;
      v_cost_price := 0;
      v_line_total := coalesce(nullif(v_item->>'unit_price', '')::numeric, 0) * v_quantity;
      v_total := v_total + v_line_total;
    end if;
  end loop;

  if v_total <= 0 or abs(v_total - coalesce(nullif(p_sale->>'total_amount', '')::numeric, -1)) > 0.01 then
    raise exception 'Sale total does not match the memo items';
  end if;

  insert into public.sales (
    shop_id, customer_id, total_amount, payment_method, status,
    created_by, session_id, employee_name
  ) values (
    v_shop_id,
    v_customer_id,
    v_total,
    coalesce(nullif(p_sale->>'payment_method', ''), 'Cash'),
    'Completed',
    v_user_id,
    v_session_id,
    coalesce(v_profile_name, 'Staff')
  )
  returning id, created_at into v_sale_id, v_created_at;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_quantity := (v_item->>'quantity')::integer;
    v_product_id := nullif(v_item->>'product_id', '')::uuid;
    v_service_id := nullif(v_item->>'service_id', '')::uuid;
    v_line_total := coalesce(nullif(v_item->>'unit_price', '')::numeric, 0) * v_quantity;

    if v_product_id is not null then
      update public.products p
      set quantity = p.quantity - v_quantity
      where p.id = v_product_id and p.shop_id = v_shop_id and p.quantity >= v_quantity
      returning p.quantity + v_quantity, p.quantity into v_previous, v_new;
      if not found then
        raise exception 'Insufficient stock for product %', v_product_id;
      end if;

      insert into public.inventory_audit_logs (
        shop_id, product_id, action, quantity_changed, previous_quantity,
        new_quantity, notes, created_by
      ) values (
        v_shop_id, v_product_id, 'SALE', -v_quantity, v_previous,
        v_new, 'Sale memo ' || v_sale_id::text, v_user_id
      );
    end if;

    insert into public.sale_items (
      sale_id, product_id, service_id, quantity, unit_price, cost_price,
      total_price, staff_id
    ) values (
      v_sale_id, v_product_id, v_service_id, v_quantity,
      coalesce(nullif(v_item->>'unit_price', '')::numeric, 0),
      case when v_product_id is null then 0 else coalesce(v_cost_price, 0) end,
      v_line_total,
      v_user_id
    );
  end loop;

  return jsonb_build_object(
    'id', v_sale_id,
    'shop_id', v_shop_id,
    'customer_id', v_customer_id,
    'total_amount', v_total,
    'payment_method', coalesce(nullif(p_sale->>'payment_method', ''), 'Cash'),
    'status', 'Completed',
    'created_at', v_created_at,
    'created_by', v_user_id,
    'employee_name', coalesce(v_profile_name, 'Staff'),
    'session_id', v_session_id
  );
end;
$function$;

revoke execute on function public.complete_sale(jsonb, jsonb) from public, anon;
grant execute on function public.complete_sale(jsonb, jsonb) to authenticated;
