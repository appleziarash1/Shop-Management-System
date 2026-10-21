import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle, Eye, FileDown, History, Plus, Printer, Receipt, RotateCcw, Trash2 } from 'lucide-react'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { supabase } from '../lib/supabaseClient'
import { useShop } from '../context/ShopContext'
import { enqueueSale, getQueueCount, isOnline } from '../lib/offlineQueue'
import { syncManager } from '../lib/syncManager'

const today = () => new Date().toISOString().slice(0, 10)
const amount = value => Number(value || 0)
const makeMemoNo = () => 'M-' + new Date().toISOString().replace(/\D/g, '').slice(0, 12) + '-' + Math.random().toString(36).slice(2, 6).toUpperCase()
const makeRow = () => ({ key: crypto.randomUUID(), kind: 'Products', itemId: '', qty: 1, rate: 0 })
const css = [
  '.memo-page{max-width:1500px;margin:0 auto;color:var(--text-main)}',
  '.memo-tabs{display:flex;gap:8px;margin:0 0 18px}.memo-tab,.memo-action{border:1px solid var(--border);background:var(--surface-elevated);color:var(--text-main);padding:10px 14px;border-radius:10px;font-weight:700;cursor:pointer;display:inline-flex;gap:8px;align-items:center;justify-content:center}',
  '.memo-tab.active,.memo-action.primary{background:var(--primary);border-color:var(--primary);color:#171717}',
  '.memo-layout{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:16px;align-items:start}.memo-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}',
  '.memo-line{display:grid;grid-template-columns:36px minmax(220px,2fr) 85px 95px 80px 105px 40px;gap:8px;align-items:center}.memo-table{display:grid;gap:8px;overflow:auto}.memo-table-head{font-size:10px;font-weight:800;color:var(--text-muted);text-transform:uppercase}',
  '.memo-summary{position:sticky;top:16px}.memo-total-row{display:flex;justify-content:space-between;gap:12px;padding:7px 0;color:var(--text-muted)}.memo-total-row.grand{font-size:18px;font-weight:800;color:var(--text-main);border-top:1px solid var(--border);margin-top:6px;padding-top:13px}',
  '.memo-notice{background:var(--surface-warning-soft);border:1px solid var(--border-warning-soft);color:var(--text-warning-strong);padding:10px 12px;border-radius:9px;margin:0 0 12px}',
  '.memo-history-row{display:grid;grid-template-columns:1fr 1.4fr 1fr 1fr auto;gap:12px;padding:12px;border-bottom:1px solid var(--border);align-items:center}.memo-number-group{display:flex;gap:8px;align-items:center}',
  '.memo-preview{position:fixed;inset:0;z-index:3000;background:#0008;display:grid;place-items:center;padding:16px}.memo-paper{background:#fff;color:#171717;width:min(760px,100%);max-height:90vh;overflow:auto;padding:28px;border-radius:12px}.memo-paper table{width:100%;border-collapse:collapse;margin:18px 0}.memo-paper th,.memo-paper td{padding:9px;border-bottom:1px solid #ddd;text-align:left}.memo-paper th{background:#f7f2dc}',
  '@media(max-width:1050px){.memo-layout{grid-template-columns:1fr}.memo-summary{position:static}}@media(max-width:760px){.memo-number-group{width:100%}.memo-number-group input{width:100%!important}.memo-fields{grid-template-columns:1fr}.memo-line{grid-template-columns:28px minmax(180px,1fr) 55px 70px 64px 84px 34px;gap:5px}.memo-history-row{grid-template-columns:1fr auto}.memo-history-row>*:nth-child(n+3){grid-column:1}.memo-paper{padding:16px}}',
  '@media print{.memo-tabs,.memo-actions,.memo-summary,.memo-no-print,.bottom-nav,.sidebar{display:none!important}.memo-page{max-width:none}.memo-paper{position:fixed;inset:0;width:100%;max-height:none;box-shadow:none;border-radius:0}.memo-preview{position:static;background:white;padding:0;display:block}}'
].join('')

const Sales = () => {
  const { currentShop, canModifyCurrentShop, shopAccessMessage, formatCurrency, currencyPreference, refreshData, showSuccess, userProfile, activeSession, logAuditEvent } = useShop()
  const [view, setView] = useState('new')
  const [products, setProducts] = useState([])
  const [services, setServices] = useState([])
  const [customers, setCustomers] = useState([])
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [preview, setPreview] = useState(false)
  const [memoNo, setMemoNo] = useState(makeMemoNo)
  const [memoDate, setMemoDate] = useState(today)
  const [customerId, setCustomerId] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerAddress, setCustomerAddress] = useState('')
  const [rows, setRows] = useState([makeRow()])
  const [discount, setDiscount] = useState(0)
  const [delivery, setDelivery] = useState(0)
  const [advance, setAdvance] = useState(0)
  const [paymentMethod, setPaymentMethod] = useState('Cash')
  const [note, setNote] = useState('')
  const [notice, setNotice] = useState('')
  const loadData = useCallback(async () => {
    if (!currentShop) return
    setLoading(true)
    try {
      const [p,s,c] = await Promise.all([syncManager.getProducts(currentShop.id),syncManager.getServices(currentShop.id),syncManager.getCustomers(currentShop.id)])
      setProducts(p||[]); setServices(s||[]); setCustomers(c||[])
    } catch (e) { setNotice('Could not load shop items: '+e.message) }
    finally { setLoading(false) }
  },[currentShop])
  const loadHistory = useCallback(async () => {
    if (!currentShop) return
    const {data,error}=await supabase.from('sales').select('id,created_at,total_amount,payment_method,memo_number,memo_date,discount_amount,delivery_charge,amount_paid,due_amount,memo_details,customers(name,phone),sale_items(quantity,unit_price,total_price,products(name),services(name))').eq('shop_id',currentShop.id).order('created_at',{ascending:false}).limit(100)
    if(error){setNotice('Could not load memo history: '+error.message);return}
    setHistory(data||[])
  },[currentShop])
  useEffect(()=>{loadData()},[loadData])
  useEffect(()=>{if(view==='history')loadHistory()},[view,loadHistory])

  const subtotal=useMemo(()=>rows.reduce((s,r)=>s+amount(r.rate)*amount(r.qty),0),[rows])
  const safeDiscount=Math.min(subtotal,Math.max(0,amount(discount)))
  const total=Math.max(0,subtotal-safeDiscount+Math.max(0,amount(delivery)))
  const paid=Math.min(total,Math.max(0,amount(advance)))
  const due=total-paid
  const totalQty=rows.reduce((s,r)=>s+amount(r.qty),0)
  const getItem=r=>(r.kind==='Services'?services:products).find(x=>x.id===r.itemId)
  const cost=rows.reduce((s,r)=>s+(r.kind==='Services'?0:amount(getItem(r)?.cost_price)*amount(r.qty)),0)
  const profit=total-cost
  const updateRow=(key,patch)=>setRows(prev=>prev.map(r=>r.key===key?{...r,...patch}:r))
  const selectCustomer=id=>{setCustomerId(id);const c=customers.find(x=>x.id===id);setCustomerName(c?.name||'');setCustomerPhone(c?.phone||'');setCustomerAddress(c?.address||'')}
  const reset=()=>{setMemoNo(makeMemoNo());setMemoDate(today());setCustomerId('');setCustomerName('');setCustomerPhone('');setCustomerAddress('');setRows([makeRow()]);setDiscount(0);setDelivery(0);setAdvance(0);setPaymentMethod('Cash');setNote('');setNotice('')}
  const snapshot=()=>({memo_number:memoNo,memo_date:memoDate,customer_name:customerName.trim(),customer_phone:customerPhone.trim(),customer_address:customerAddress.trim(),note:note.trim(),subtotal,discount_amount:safeDiscount,delivery_charge:amount(delivery),amount_paid:paid,due_amount:due})
  const pdf=(sale=null)=>{
    const d=sale?.memo_details||snapshot()
    const doc=new jsPDF({unit:'mm',format:'a4'}), w=doc.internal.pageSize.getWidth()
    doc.setFont('helvetica','bold');doc.setFontSize(20);doc.text(currentShop?.name||'ShopMS',14,18)
    doc.setFont('helvetica','normal');doc.setFontSize(10);doc.text('SALES MEMO',w-14,18,{align:'right'})
    doc.setDrawColor(230,184,13);doc.setLineWidth(1.2);doc.line(14,23,w-14,23)
    doc.text('Memo No: '+(sale?.memo_number||d.memo_number||memoNo),14,32)
    doc.text('Date: '+(sale?.memo_date||d.memo_date||memoDate),w-14,32,{align:'right'})
    doc.text('Customer: '+(sale?.customers?.name||d.customer_name||customerName||'Walk-in Customer'),14,40)
    doc.text('Phone: '+(sale?.customers?.phone||d.customer_phone||customerPhone||'—'),14,47)
    doc.text('Address: '+(d.customer_address||customerAddress||'—'),14,54,{maxWidth:w-28})
    const list=sale?.sale_items||rows.filter(r=>r.itemId).map(r=>({name:getItem(r)?.name,quantity:r.qty,unit_price:r.rate,total_price:amount(r.rate)*amount(r.qty)}))
    autoTable(doc,{startY:64,margin:{left:14,right:14},head:[['SL','Product / Service','Qty','Rate (BDT)','Amount (BDT)']],body:list.map((x,i)=>[String(i+1),x.name||x.products?.name||x.services?.name||'Item',String(x.quantity),amount(x.unit_price).toFixed(2),amount(x.total_price||x.unit_price*x.quantity).toFixed(2)]),headStyles:{fillColor:[230,184,13],textColor:[25,25,25]},styles:{font:'helvetica',fontSize:9,cellPadding:3}})
    let y=(doc.lastAutoTable?.finalY||70)+10
    const totals=[['Subtotal',d.subtotal??subtotal],['Discount',sale?.discount_amount??d.discount_amount??safeDiscount],['Delivery',sale?.delivery_charge??d.delivery_charge??amount(delivery)],['Grand Total',sale?.total_amount??total],['Advance',sale?.amount_paid??d.amount_paid??paid],['Due',sale?.due_amount??d.due_amount??due],['Estimated Profit',profit]]
    totals.forEach(([label,value],i)=>{doc.text(label,w-78,y+i*7);doc.text(amount(value).toFixed(2)+' BDT',w-14,y+i*7,{align:'right'})})
    y+=totals.length*7+6
    if(d.note||note){doc.setFont('helvetica','bold');doc.text('Note',14,y);doc.setFont('helvetica','normal');doc.text(d.note||note,14,y+6,{maxWidth:w-28})}
    doc.save('memo-'+(sale?.memo_number||d.memo_number||memoNo)+'.pdf')
  }
  const save=async()=>{
    if(saving)return
    if(!canModifyCurrentShop){setNotice(shopAccessMessage);return}
    const valid=rows.filter(r=>r.itemId&&amount(r.qty)>0&&amount(r.rate)>=0)
    if(!valid.length){setNotice('Add at least one product or service.');return}
    if(due>0&&!customerName.trim()){setNotice('Enter a customer name to record a due balance.');return}
    setSaving(true);setNotice('')
    const memo_details=snapshot()
    const sale={shop_id:currentShop.id,customer_id:customerId||null,customer_name:customerName.trim()||null,customer_phone:customerPhone.trim()||null,customer_address:customerAddress.trim()||null,total_amount:total,payment_method:paymentMethod,amount_paid:paid,discount_amount:safeDiscount,delivery_charge:amount(delivery),memo_number:memoNo,memo_date:memoDate,memo_details,session_id:activeSession?.id||null,employee_name:userProfile?.full_name||null,created_by:userProfile?.id||null}
    const items=valid.map(r=>({product_id:r.kind==='Products'?r.itemId:null,service_id:r.kind==='Services'?r.itemId:null,quantity:amount(r.qty),unit_price:amount(r.rate),cost_price:r.kind==='Services'?0:amount(getItem(r)?.cost_price),total_price:amount(r.rate)*amount(r.qty)}))
    try{
      let saved
      if(isOnline()){const {data,error}=await supabase.rpc('complete_sale',{p_sale:sale,p_items:items});if(error)throw error;saved=data}
      else await enqueueSale({sale,items})
      logAuditEvent?.({actionType:'SALE',description:'Saved memo '+memoNo+' — '+formatCurrency(total),metadata:{memo_number:memoNo,total_amount:total,items_count:items.length,customer_name:customerName}})
      pdf(saved||null)
      if(isOnline()){showSuccess('Memo saved and stock updated.');refreshData(true)}
      else showSuccess('Memo saved on this device ('+(await getQueueCount())+' waiting to sync).')
      reset();await loadData()
    }catch(e){console.error('Memo save failed:',e);setNotice('Could not save memo: '+(e.message||'Please try again.'))}
    finally{setSaving(false)}
  }
  const card={background:'var(--surface-elevated)',border:'1px solid var(--border)',borderRadius:14,padding:18,boxShadow:'var(--shadow)'}
  const field={width:'100%',minWidth:0,padding:'10px 11px',border:'1px solid var(--border)',borderRadius:9,background:'var(--bg-sidebar)',color:'var(--text-main)'}
  const label={display:'block',fontSize:12,fontWeight:600,marginBottom:6,color:'var(--text-muted)'}

  return <div className="memo-page">
    <style>{css}</style>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,marginBottom:8,flexWrap:'wrap'}}><div><h1 style={{margin:0}}>Sell / Memo</h1><p style={{margin:'4px 0 0',color:'var(--text-muted)'}}>Prepare a customer memo and update stock when it is saved.</p></div><span style={{fontSize:12,color:'var(--text-muted)'}}>{currencyPreference} · {currentShop?.name||'Shop'}</span></div>
    <div className="memo-tabs"><button className={'memo-tab '+(view==='new'?'active':'')} onClick={()=>setView('new')}><Receipt size={16}/> New Sales Memo</button><button className={'memo-tab '+(view==='history'?'active':'')} onClick={()=>setView('history')}><History size={16}/> Memo History</button></div>
    {notice&&<div className="memo-notice">{notice}</div>}
    {view==='history'?<section style={card}><div style={{display:'flex',justifyContent:'space-between',marginBottom:12}}><h2 style={{margin:0}}>Memo History</h2><button className="memo-action" onClick={loadHistory}><RotateCcw size={15}/> Refresh</button></div>{history.length?history.map(s=><div className="memo-history-row" key={s.id}><b>{s.memo_number||s.id.slice(0,8)}</b><span>{s.customers?.name||s.memo_details?.customer_name||'Walk-in Customer'}</span><span>{s.memo_date||new Date(s.created_at).toLocaleDateString()}</span><b>{formatCurrency(s.total_amount)}</b><button className="memo-action" onClick={()=>pdf(s)}><FileDown size={15}/> PDF</button></div>):<p style={{color:'var(--text-muted)'}}>{loading?'Loading memos…':'No memos yet.'}</p>}</section>:<>
      <section style={{...card,marginBottom:14}}><div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',marginBottom:14,flexWrap:'wrap'}}><h2 style={{margin:0}}>Memo Details</h2><div className="memo-number-group"><label style={{fontSize:12,color:'var(--text-muted)'}}>Memo No.</label><input aria-label="Memo number" style={{...field,width:190}} value={memoNo} onChange={e=>setMemoNo(e.target.value)}/></div></div>
        <div className="memo-fields"><div><label style={label}>Date</label><input type="date" style={field} value={memoDate} onChange={e=>setMemoDate(e.target.value)}/></div><div><label style={label}>Select saved customer</label><select style={field} value={customerId} onChange={e=>selectCustomer(e.target.value)}><option value="">New / Select customer</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name}{c.phone?' · '+c.phone:''}</option>)}</select></div><div><label style={label}>Customer Name *</label><input style={field} value={customerName} onChange={e=>{setCustomerName(e.target.value);setCustomerId('')}} placeholder="Customer name"/></div><div><label style={label}>Phone</label><input style={field} value={customerPhone} onChange={e=>{setCustomerPhone(e.target.value);setCustomerId('')}} placeholder="01XXXXXXXXX"/></div><div style={{gridColumn:'1/-1'}}><label style={label}>Address</label><input style={field} value={customerAddress} onChange={e=>{setCustomerAddress(e.target.value);setCustomerId('')}} placeholder="Customer address"/></div></div>
      </section>
      <div className="memo-layout"><div>
        <section style={{...card,marginBottom:14}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,marginBottom:12,flexWrap:'wrap'}}><div><h2 style={{margin:'0 0 3px'}}>Items</h2><small style={{color:'var(--text-muted)'}}>Rate, quantity, amount and cost are shown as you edit.</small></div><button className="memo-action primary" onClick={()=>setRows(p=>[...p,makeRow()])}><Plus size={16}/> Add Product Row</button></div>
          {loading?<p>Loading items…</p>:<div className="memo-table">
            <div className="memo-line memo-table-head"><span>SL</span><span>Product / Service</span><span>Available</span><span>Rate</span><span>Qty</span><span>Amount</span><span></span></div>
            {rows.map((r,i)=>{const item=getItem(r),options=r.kind==='Services'?services:products;return <div className="memo-line" key={r.key}><b>{String(i+1).padStart(2,'0')}</b><div style={{display:'flex',gap:5,minWidth:0}}><select aria-label="Item type" style={{...field,width:96,padding:'9px 5px'}} value={r.kind} onChange={e=>updateRow(r.key,{kind:e.target.value,itemId:'',rate:0})}><option>Products</option><option>Services</option></select><select aria-label="Product or service" style={{...field,padding:'9px 6px',flex:1}} value={r.itemId} onChange={e=>{const x=options.find(z=>z.id===e.target.value);updateRow(r.key,{itemId:e.target.value,rate:amount(x?.selling_price??x?.price)})}}><option value="">Select item</option>{options.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></div><span style={{fontSize:12,color:'var(--text-muted)'}}>{r.kind==='Services'?'—':(item?.quantity??'—')}</span><input aria-label="Rate" type="number" min="0" style={{...field,padding:'9px 6px'}} value={r.rate} onChange={e=>updateRow(r.key,{rate:e.target.value})}/><input aria-label="Quantity" type="number" min="1" max={r.kind==='Products'?item?.quantity:undefined} style={{...field,padding:'9px 6px'}} value={r.qty} onChange={e=>updateRow(r.key,{qty:e.target.value})}/><b style={{fontSize:12}}>{formatCurrency(amount(r.rate)*amount(r.qty))}</b><button aria-label="Remove row" className="memo-action" style={{padding:7}} onClick={()=>setRows(p=>p.length===1?[makeRow()]:p.filter(x=>x.key!==r.key))}><Trash2 size={15}/></button></div>})}
          </div>}
        </section>
        <section style={{...card,marginBottom:14}}><h2 style={{margin:'0 0 12px'}}>Memo Note</h2><textarea style={{...field,minHeight:82,resize:'vertical'}} value={note} onChange={e=>setNote(e.target.value)} placeholder="Note printed on the memo"/></section>
        <div className="memo-actions"><button className="memo-action" onClick={()=>setPreview(true)}><Eye size={16}/> Preview</button><button className="memo-action" onClick={()=>{setPreview(true);window.setTimeout(()=>window.print(),250)}}><Printer size={16}/> Print</button><button className="memo-action" onClick={()=>pdf()}><FileDown size={16}/> Save PDF</button><button className="memo-action" onClick={reset}><RotateCcw size={16}/> New / Clear</button></div>
      </div>
      <aside className="memo-summary" style={card}><h2 style={{margin:'0 0 10px'}}>Memo Total</h2><div className="memo-total-row"><span>Total Qty</span><b>{totalQty}</b></div><div className="memo-total-row"><span>Subtotal</span><b>{formatCurrency(subtotal)}</b></div><label style={{...label,marginTop:8}}>Discount (৳)</label><input type="number" min="0" style={field} value={discount} onChange={e=>setDiscount(e.target.value)}/><label style={{...label,marginTop:10}}>Delivery Charge (৳)</label><input type="number" min="0" style={field} value={delivery} onChange={e=>setDelivery(e.target.value)}/><div className="memo-total-row grand"><span>Grand Total</span><b>{formatCurrency(total)}</b></div><label style={{...label,marginTop:8}}>Advance (৳)</label><input type="number" min="0" max={total} style={field} value={advance} onChange={e=>setAdvance(e.target.value)}/><div className="memo-total-row"><span>Due</span><b>{formatCurrency(due)}</b></div><div className="memo-total-row"><span>COGS</span><b>{formatCurrency(cost)}</b></div><div className="memo-total-row"><span>Estimated Profit</span><b>{formatCurrency(profit)}</b></div><label style={{...label,marginTop:8}}>Payment Method</label><select style={field} value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value)}><option>Cash</option><option>Mobile Money</option><option>Credit</option></select><div className="memo-actions"><button className="memo-action" onClick={()=>setPreview(true)}><Eye size={15}/> Preview</button><button className="memo-action primary" disabled={saving||loading||!rows.some(r=>r.itemId)} onClick={save}><CheckCircle size={15}/>{saving?'Saving…':'Save Memo'}</button></div><small style={{display:'block',marginTop:10,color:'var(--text-muted)'}}>Saving records the memo and reduces stock in the same transaction.</small></aside>
      </div>
    </>}
    {preview&&<div className="memo-preview" onClick={e=>{if(e.target===e.currentTarget)setPreview(false)}}><div className="memo-paper"><div style={{display:'flex',justifyContent:'space-between',borderBottom:'2px solid #e6b80d',paddingBottom:12}}><div><h2 style={{margin:0}}>{currentShop?.name||'Shop'}</h2><span>SALES MEMO</span></div><div style={{textAlign:'right'}}>Memo No. <b>{memoNo}</b><br/>Date: {memoDate}</div></div><p style={{margin:'16px 0 8px'}}><b>Customer:</b> {customerName||'Walk-in Customer'}　<b>Phone:</b> {customerPhone||'—'}</p><p><b>Address:</b> {customerAddress||'—'}</p><table><thead><tr><th>SL</th><th>Product / Service</th><th>Rate</th><th>Qty</th><th>Amount</th></tr></thead><tbody>{rows.filter(r=>r.itemId).map((r,i)=><tr key={r.key}><td>{i+1}</td><td>{getItem(r)?.name}</td><td>{formatCurrency(r.rate)}</td><td>{r.qty}</td><td>{formatCurrency(amount(r.rate)*amount(r.qty))}</td></tr>)}</tbody></table><div style={{maxWidth:280,marginLeft:'auto'}}>{[['Subtotal',subtotal],['Discount',safeDiscount],['Delivery',delivery],['Grand Total',total],['Advance',paid],['Due',due]].map(([k,v])=><div className="memo-total-row" key={k}><span>{k}</span><b>{formatCurrency(v)}</b></div>)}</div>{note&&<p><b>Note:</b> {note}</p>}<div className="memo-actions memo-no-print"><button className="memo-action" onClick={()=>setPreview(false)}>Close</button><button className="memo-action primary" onClick={()=>pdf()}><FileDown size={15}/> Save PDF</button></div></div></div>}
  </div>
}

export default Sales
