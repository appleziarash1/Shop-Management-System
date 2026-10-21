alter table public.sales
  add column if not exists memo_number text,
  add column if not exists memo_date date,
  add column if not exists discount_amount numeric(12,2) not null default 0,
  add column if not exists delivery_charge numeric(12,2) not null default 0,
  add column if not exists amount_paid numeric(12,2) not null default 0,
  add column if not exists due_amount numeric(12,2) not null default 0,
  add column if not exists memo_details jsonb not null default '{}'::jsonb;

alter table public.customers add column if not exists address text;

create unique index if not exists sales_shop_memo_number_unique
  on public.sales (shop_id, memo_number) where memo_number is not null;

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
  v_offline_id uuid;
  v_role text;
  v_profile_name text;
  v_profile_shop_id uuid;
  v_sale_id uuid;
  v_created_at timestamptz;
  v_subtotal numeric := 0;
  v_total numeric := 0;
  v_discount numeric := 0;
  v_delivery numeric := 0;
  v_paid numeric := 0;
  v_due numeric := 0;
  v_line_total numeric;
  v_quantity integer;
  v_product_id uuid;
  v_service_id uuid;
  v_product_shop uuid;
  v_cost_price numeric;
  v_item jsonb;
  v_previous integer;
  v_new integer;
  v_existing public.sales%rowtype;
  v_memo_number text;
  v_memo_date date;
  v_customer_name text;
  v_customer_phone text;
  v_customer_address text;
  v_payment_method text;
  v_details jsonb;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_sale is null or jsonb_typeof(p_sale) <> 'object'
     or p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'Memo must include at least one item';
  end if;

  v_shop_id := nullif(p_sale->>'shop_id', '')::uuid;
  v_offline_id := nullif(p_sale->>'offline_id', '')::uuid;
  if v_shop_id is null then raise exception 'Shop is required'; end if;

  select role, full_name, shop_id into v_role, v_profile_name, v_profile_shop_id
  from public.profiles where id = v_user_id;
  if v_role not in ('Owner', 'Manager', 'Cashier') then
    raise exception 'Valid shop account required';
  end if;
  if not exists (
    select 1 from public.shops s
    where s.id = v_shop_id and (s.owner_id = v_user_id or v_profile_shop_id = s.id)
  ) then raise exception 'Not authorized for this shop'; end if;

  if v_offline_id is not null then
    select * into v_existing from public.sales s
    where s.offline_id = v_offline_id and s.shop_id = v_shop_id and s.created_by = v_user_id;
    if found then
      return jsonb_build_object('id',v_existing.id,'shop_id',v_existing.shop_id,
        'customer_id',v_existing.customer_id,'total_amount',v_existing.total_amount,
        'payment_method',v_existing.payment_method,'status',v_existing.status,
        'created_at',v_existing.created_at,'created_by',v_existing.created_by,
        'employee_name',v_existing.employee_name,'session_id',v_existing.session_id,
        'memo_number',v_existing.memo_number,'amount_paid',v_existing.amount_paid,
        'due_amount',v_existing.due_amount);
    end if;
  end if;

  v_customer_id := nullif(p_sale->>'customer_id', '')::uuid;
  v_customer_name := nullif(btrim(p_sale->>'customer_name'), '');
  v_customer_phone := nullif(btrim(p_sale->>'customer_phone'), '');
  v_customer_address := nullif(btrim(p_sale->>'customer_address'), '');

  if v_customer_id is not null and not exists (
    select 1 from public.customers c where c.id=v_customer_id and c.shop_id=v_shop_id
  ) then raise exception 'Customer does not belong to this shop'; end if;

  if v_customer_id is null and v_customer_name is not null then
    select c.id into v_customer_id from public.customers c
    where c.shop_id=v_shop_id and (
      (v_customer_phone is not null and c.phone=v_customer_phone)
      or (v_customer_phone is null and lower(c.name)=lower(v_customer_name))
    ) order by c.created_at desc limit 1;
    if v_customer_id is null then
      insert into public.customers(shop_id,name,phone,address)
      values(v_shop_id,v_customer_name,v_customer_phone,v_customer_address)
      returning id into v_customer_id;
    else
      update public.customers set
        name=v_customer_name,
        phone=coalesce(v_customer_phone,phone),
        address=coalesce(v_customer_address,address)
      where id=v_customer_id and shop_id=v_shop_id;
    end if;
  end if;

  v_session_id := nullif(p_sale->>'session_id', '')::uuid;
  if v_session_id is not null and not exists (
    select 1 from public.employee_sessions es where es.id=v_session_id
      and es.employee_id=v_user_id and es.shop_id=v_shop_id and es.status='active'
  ) then v_session_id := null; end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_quantity := nullif(v_item->>'quantity','')::integer;
    if v_quantity is null or v_quantity < 1 then raise exception 'Item quantity must be positive'; end if;
    v_product_id := nullif(v_item->>'product_id','')::uuid;
    v_service_id := nullif(v_item->>'service_id','')::uuid;
    if (v_product_id is null) = (v_service_id is null) then
      raise exception 'Each memo row must be one product or service';
    end if;
    if coalesce(nullif(v_item->>'unit_price','')::numeric,0) < 0 then
      raise exception 'Item price cannot be negative';
    end if;
    if v_product_id is not null then
      select p.shop_id into v_product_shop from public.products p
      where p.id=v_product_id for update;
      if v_product_shop is distinct from v_shop_id then
        raise exception 'Product does not belong to this shop';
      end if;
    else
      if not exists(select 1 from public.services s where s.id=v_service_id
        and s.shop_id=v_shop_id and s.is_active) then
        raise exception 'Service does not belong to this shop';
      end if;
    end if;
    v_line_total := coalesce(nullif(v_item->>'unit_price','')::numeric,0)*v_quantity;
    v_subtotal := v_subtotal+v_line_total;
  end loop;

  v_discount := greatest(coalesce(nullif(p_sale->>'discount_amount','')::numeric,0),0);
  v_delivery := greatest(coalesce(nullif(p_sale->>'delivery_charge','')::numeric,0),0);
  if v_discount > v_subtotal then raise exception 'Discount cannot exceed subtotal'; end if;
  v_total := v_subtotal-v_discount+v_delivery;
  if v_total <= 0 or abs(v_total-coalesce(nullif(p_sale->>'total_amount','')::numeric,-1))>0.01 then
    raise exception 'Memo total does not match its items and adjustments';
  end if;
  v_paid := coalesce(nullif(p_sale->>'amount_paid','')::numeric,
    case when coalesce(p_sale->>'payment_method','Cash')='Credit' then 0 else v_total end);
  if v_paid < 0 or v_paid > v_total then raise exception 'Advance must be between zero and the total'; end if;
  v_due := v_total-v_paid;
  if v_due > 0 and v_customer_id is null then
    raise exception 'Select or enter a customer to save a due balance';
  end if;

  v_memo_number := coalesce(nullif(btrim(p_sale->>'memo_number'), ''),
    'M-'||to_char(now(),'YYYYMMDD-HH24MISS')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,4)));
  v_memo_date := coalesce(nullif(p_sale->>'memo_date','')::date,current_date);
  v_payment_method := coalesce(nullif(p_sale->>'payment_method',''),'Cash');
  v_details := coalesce(p_sale->'memo_details','{}'::jsonb);
  if jsonb_typeof(v_details)<>'object' then v_details := '{}'::jsonb; end if;
  v_details := v_details || jsonb_build_object(
    'customer_name',v_customer_name,'customer_phone',v_customer_phone,
    'customer_address',v_customer_address,'discount_amount',v_discount,
    'delivery_charge',v_delivery,'amount_paid',v_paid,'due_amount',v_due,
    'memo_number',v_memo_number,'memo_date',v_memo_date);

  insert into public.sales (
    shop_id,customer_id,total_amount,payment_method,status,created_by,session_id,
    employee_name,offline_id,memo_number,memo_date,discount_amount,delivery_charge,
    amount_paid,due_amount,memo_details
  ) values (
    v_shop_id,v_customer_id,v_total,v_payment_method,'Completed',v_user_id,v_session_id,
    coalesce(v_profile_name,'Staff'),v_offline_id,v_memo_number,v_memo_date,
    v_discount,v_delivery,v_paid,v_due,v_details
  ) returning id,created_at into v_sale_id,v_created_at;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_quantity := (v_item->>'quantity')::integer;
    v_product_id := nullif(v_item->>'product_id','')::uuid;
    v_service_id := nullif(v_item->>'service_id','')::uuid;
    v_line_total := coalesce(nullif(v_item->>'unit_price','')::numeric,0)*v_quantity;
    v_cost_price := 0;
    if v_product_id is not null then
      select p.cost_price into v_cost_price from public.products p where p.id=v_product_id;
      update public.products p set quantity=p.quantity-v_quantity
      where p.id=v_product_id and p.shop_id=v_shop_id and p.quantity>=v_quantity
      returning p.quantity+v_quantity,p.quantity into v_previous,v_new;
      if not found then raise exception 'Insufficient stock for product %',v_product_id; end if;
      insert into public.inventory_audit_logs(shop_id,product_id,action,quantity_changed,
        previous_quantity,new_quantity,notes,created_by)
      values(v_shop_id,v_product_id,'SALE',-v_quantity,v_previous,v_new,
        'Sale memo '||v_memo_number,v_user_id);
    end if;
    insert into public.sale_items(sale_id,product_id,service_id,quantity,unit_price,
      cost_price,total_price,staff_id)
    values(v_sale_id,v_product_id,v_service_id,v_quantity,
      coalesce(nullif(v_item->>'unit_price','')::numeric,0),coalesce(v_cost_price,0),
      v_line_total,v_user_id);
  end loop;

  if v_due>0 then
    insert into public.customer_credit(shop_id,customer_id,amount_owed,is_settled,notes,created_by)
    values(v_shop_id,v_customer_id,v_due,false,'Due from memo '||v_memo_number,v_user_id);
  end if;

  return jsonb_build_object('id',v_sale_id,'shop_id',v_shop_id,'customer_id',v_customer_id,
    'total_amount',v_total,'payment_method',v_payment_method,'status','Completed',
    'created_at',v_created_at,'created_by',v_user_id,'employee_name',coalesce(v_profile_name,'Staff'),
    'session_id',v_session_id,'memo_number',v_memo_number,'memo_date',v_memo_date,
    'amount_paid',v_paid,'due_amount',v_due,'discount_amount',v_discount,
    'delivery_charge',v_delivery,'memo_details',v_details);
end;
$function$;

revoke execute on function public.complete_sale(jsonb,jsonb) from public,anon;
grant execute on function public.complete_sale(jsonb,jsonb) to authenticated;
