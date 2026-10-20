import { withSupabase } from 'npm:@supabase/server@1'

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

    let createdUserId: string | null = null
    try {
      const { name, shop_id, role, password } = await req.json()
      const uid = ctx.userClaims?.sub

      if (!uid) return json({ error: 'Authentication required' }, 401)
      if (typeof name !== 'string' || !/^[A-Za-z ]{2,60}$/.test(name.trim())) {
        return json({ error: 'Enter a valid staff name (letters and spaces only).' }, 400)
      }
      if (typeof shop_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(shop_id)) {
        return json({ error: 'Select a valid shop.' }, 400)
      }
      if (!['Manager', 'Cashier'].includes(role)) {
        return json({ error: 'Invalid staff role.' }, 400)
      }
      if (typeof password !== 'string' || password.length < 8 || password.length > 72 ||
          !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
        return json({ error: 'Password must be 8–72 characters and include uppercase, lowercase, and a number.' }, 400)
      }

      const admin = ctx.supabaseAdmin
      const [{ data: profile, error: profileError }, { data: shop, error: shopError }] = await Promise.all([
        admin.from('profiles').select('role').eq('id', uid).maybeSingle(),
        admin.from('shops').select('id, name').eq('id', shop_id).eq('owner_id', uid).maybeSingle(),
      ])
      if (profileError || shopError) throw new Error('Unable to verify account permissions.')
      if (profile?.role !== 'Owner') return json({ error: 'Only the shop owner can add staff.' }, 403)
      if (!shop) return json({ error: 'Shop not found or access denied.' }, 404)

      const staffSlug = name.trim().toLowerCase().replace(/\s+/g, '')
      const branchSlug = String(shop.name || '').toLowerCase().replace(/\s+/g, '')
      if (!/^[a-z]+$/.test(staffSlug) || !/^[a-z]+$/.test(branchSlug)) {
        return json({ error: 'Staff and shop names must use English letters only for staff login.' }, 400)
      }
      const email = `${staffSlug}.${branchSlug}@sms.com`

      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: name.trim() },
      })
      if (createError) {
        if (/already|registered|exists/i.test(createError.message)) {
          return json({ error: 'A staff login with this name and shop already exists.' }, 409)
        }
        throw new Error('Could not create staff login.')
      }
      if (!created.user) throw new Error('Could not create staff login.')
      createdUserId = created.user.id

      const { error: insertError } = await admin.from('profiles').insert({
        id: created.user.id,
        full_name: name.trim(),
        role,
        shop_id,
      })
      if (insertError) {
        await admin.auth.admin.deleteUser(created.user.id)
        createdUserId = null
        throw new Error('Could not save staff profile.')
      }

      return json({ ok: true, message: 'Staff member added.' }, 201)
    } catch (error) {
      if (createdUserId) {
        try { await ctx.supabaseAdmin.auth.admin.deleteUser(createdUserId) } catch { /* best effort rollback */ }
      }
      console.error('create-staff-member failed', error)
      return json({ error: error instanceof Error ? error.message : 'Unable to add staff member.' }, 400)
    }
  }),
}
