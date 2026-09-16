(() => {
  'use strict';

  const STORAGE_KEY = 'carlog:admin:v1';
  const VERSION = 1;
  const now = () => new Date().toISOString();
  const uid = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const money = (value) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(value) || 0);
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const relative = (iso) => {
    const time = Date.parse(iso || ''); if (!Number.isFinite(time)) return '—';
    const minutes = Math.max(0, Math.floor((Date.now() - time) / 60000));
    if (minutes < 60) return `${Math.max(1, minutes)}m`;
    const hours = Math.floor(minutes / 60); if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
  };

  const seed = () => ({
    version: VERSION,
    company: { name:'Car Log Connection', email:'operations@carlogconnection.com', phone:'', website:'https://carlogconnection.com/', timezone:'America/New_York' },
    customers: [
      { id:'CUS-1001', name:'Alex Morgan', email:'alex@example.com', phone:'(305) 555-0181', status:'Active', createdAt:'2026-09-12T14:00:00.000Z', updatedAt:'2026-09-15T15:20:00.000Z' },
      { id:'CUS-1002', name:'David Chen', email:'david@example.com', phone:'(469) 555-0192', status:'Active', createdAt:'2026-09-13T12:10:00.000Z', updatedAt:'2026-09-15T18:35:00.000Z' }
    ],
    leads: [
      { id:'LD-1001', customerId:'CUS-1001', contactName:'Alex Morgan', email:'alex@example.com', phone:'(305) 555-0181', origin:'Los Angeles, CA', destination:'Miami, FL', vehicle:'2024 Tesla Model 3', status:'Quoted', source:'Website', assignedTo:'Sales Team', estimate:1275, createdAt:'2026-09-15T15:12:00.000Z', updatedAt:'2026-09-16T07:20:00.000Z' },
      { id:'LD-1002', customerId:'CUS-1002', contactName:'David Chen', email:'david@example.com', phone:'(469) 555-0192', origin:'Newark, NJ', destination:'Dallas, TX', vehicle:'2023 BMW X5', status:'Follow-up', source:'Referral', assignedTo:'Sales Team', estimate:1080, createdAt:'2026-09-15T18:30:00.000Z', updatedAt:'2026-09-16T06:50:00.000Z' },
      { id:'LD-1003', customerId:'', contactName:'Sarah Wilson', email:'sarah@example.com', phone:'(602) 555-0177', origin:'Phoenix, AZ', destination:'Austin, TX', vehicle:'2022 Ford Bronco', status:'New', source:'Organic', assignedTo:'Unassigned', estimate:940, createdAt:'2026-09-16T05:45:00.000Z', updatedAt:'2026-09-16T05:45:00.000Z' }
    ],
    quotes: [
      { id:'QT-1001', leadId:'LD-1001', customerId:'CUS-1001', route:'Los Angeles, CA → Miami, FL', customerPrice:1275, carrierEstimate:950, margin:325, status:'Sent', expiresAt:'2026-09-19', createdAt:'2026-09-15T16:30:00.000Z', updatedAt:'2026-09-16T07:10:00.000Z' },
      { id:'QT-1002', leadId:'LD-1002', customerId:'CUS-1002', route:'Newark, NJ → Dallas, TX', customerPrice:1080, carrierEstimate:820, margin:260, status:'Viewed', expiresAt:'2026-09-18', createdAt:'2026-09-15T19:10:00.000Z', updatedAt:'2026-09-16T06:55:00.000Z' }
    ],
    orders: [
      { id:'ORD-1001', sourceQuoteId:'QT-0999', customerId:'CUS-1001', customerName:'Alex Morgan', route:'Chicago, IL → Miami, FL', vehicle:'2021 Audi Q5', customerPrice:1350, carrierPay:1025, carrierId:'CAR-1001', status:'In Transit', pickupStart:'2026-09-15', deliveryEta:'2026-09-18', updatedAt:'2026-09-16T07:45:00.000Z' },
      { id:'ORD-1002', sourceQuoteId:'QT-0998', customerId:'CUS-1002', customerName:'David Chen', route:'Boston, MA → Nashville, TN', vehicle:'2020 Mercedes GLC', customerPrice:1140, carrierPay:880, carrierId:'', status:'Sourcing', pickupStart:'2026-09-18', deliveryEta:'2026-09-21', updatedAt:'2026-09-16T07:15:00.000Z' }
    ],
    carriers: [
      { id:'CAR-1001', name:'RoadStar Auto Transport', mc:'MC 1452387', dot:'USDOT 3918241', authorityStatus:'Active', insuranceStatus:'Verified', approval:'Approved', risk:'Low', phone:'(800) 555-0188', email:'dispatch@roadstar.example', updatedAt:'2026-09-15T21:00:00.000Z' },
      { id:'CAR-1002', name:'Sunline Carrier Group', mc:'MC 1882301', dot:'USDOT 4021198', authorityStatus:'Active', insuranceStatus:'Expires soon', approval:'Review', risk:'Medium', phone:'(800) 555-0114', email:'ops@sunline.example', updatedAt:'2026-09-14T18:00:00.000Z' }
    ],
    payments: [{ id:'PAY-1001', orderId:'ORD-1001', type:'Customer', amount:500, status:'Received', date:'2026-09-15' }],
    documents: [
      { id:'DOC-1001', name:'Rate Confirmation · ORD-1001', entity:'Order', entityId:'ORD-1001', type:'Rate confirmation', status:'Signed', updatedAt:'2026-09-15T22:00:00.000Z' },
      { id:'DOC-1002', name:'Insurance · RoadStar', entity:'Carrier', entityId:'CAR-1001', type:'Insurance certificate', status:'Verified', updatedAt:'2026-09-14T10:00:00.000Z' }
    ],
    communications: [
      { id:'COM-1001', subject:'Pickup confirmation', contact:'Alex Morgan', channel:'Email', entity:'ORD-1001', status:'Sent', updatedAt:'2026-09-16T07:35:00.000Z' },
      { id:'COM-1002', subject:'Quote follow-up', contact:'David Chen', channel:'SMS', entity:'QT-1002', status:'Queued', updatedAt:'2026-09-16T06:42:00.000Z' }
    ],
    cmsPages: [
      { id:'PAGE-home', slug:'/', title:'Home', status:'Published', seoTitle:'Car Log Connection | Auto Transport', description:'Reliable vehicle shipping with a dedicated brokerage team.', updatedAt:'2026-09-15T20:00:00.000Z' },
      { id:'PAGE-services', slug:'/services', title:'Services', status:'Published', seoTitle:'Auto Transport Services | Car Log Connection', description:'Open and enclosed auto transport services.', updatedAt:'2026-09-14T17:00:00.000Z' },
      { id:'PAGE-about', slug:'/about', title:'About', status:'Draft', seoTitle:'About Car Log Connection', description:'Meet the team behind Car Log Connection.', updatedAt:'2026-09-16T04:00:00.000Z' }
    ],
    navItems: [
      { id:'NAV-1', label:'Home', href:'/', order:1, visible:true },
      { id:'NAV-2', label:'Services', href:'/services', order:2, visible:true },
      { id:'NAV-3', label:'About', href:'/about', order:3, visible:true },
      { id:'NAV-4', label:'Contact', href:'/contact', order:4, visible:true }
    ],
    integrations: [
      { id:'central-dispatch', name:'Central Dispatch', category:'Load board', status:'Needs credentials' },
      { id:'super-dispatch', name:'Super Dispatch', category:'Load board', status:'Needs credentials' },
      { id:'quickbooks', name:'QuickBooks', category:'Accounting', status:'Needs credentials' },
      { id:'stripe', name:'Stripe', category:'Payments', status:'Needs credentials' },
      { id:'twilio', name:'Twilio', category:'Communications', status:'Needs credentials' },
      { id:'website', name:'Website forms & chat', category:'Website', status:'Metadata only' }
    ],
    automations: [
      { id:'AUT-1', name:'Quote follow-up', trigger:'Quote sent + 24h', action:'Create follow-up task', enabled:false },
      { id:'AUT-2', name:'Pickup reminder', trigger:'Pickup - 1 day', action:'Queue customer reminder', enabled:false }
    ],
    users: [
      { id:'USR-1', name:'Operations Admin', email:'', role:'Administrator', status:'Active' },
      { id:'USR-2', name:'Sales Team', email:'', role:'Sales', status:'Active' }
    ],
    audit: [
      { id:'AUD-1', action:'order.status.changed', entity:'order', entityId:'ORD-1001', detail:'Order moved to In Transit', at:'2026-09-16T07:45:00.000Z' },
      { id:'AUD-2', action:'quote.viewed', entity:'quote', entityId:'QT-1002', detail:'Customer viewed quote', at:'2026-09-16T06:55:00.000Z' },
      { id:'AUD-3', action:'lead.created', entity:'lead', entityId:'LD-1003', detail:'Website lead created', at:'2026-09-16T05:45:00.000Z' }
    ]
  });

  const load = () => {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (parsed?.version === VERSION) return parsed;
    } catch (_) {}
    const initial = seed();
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(initial)); } catch (_) {}
    return initial;
  };

  let state = load();
  let route = 'dashboard';
  let settingsTab = 'company';
  let query = '';

  const navGroups = [
    ['Broker Management', [
      ['dashboard','Dashboard','◫'],['leads','Leads','◎'],['quotes','Quotes','＄'],['customers','Customers','◉'],['orders','Orders','▣'],['dispatch','Dispatch','➜'],['carriers','Carriers','▤'],['finance','Finance','▥'],['communications','Communications','✉'],['documents','Documents','▧'],['reports','Reports','⌁']
    ]],
    ['Website', [['cms','CMS','◇']]],
    ['Administration', [['settings','Settings','⚙']]]
  ];

  const titles = {
    dashboard:['Broker Management','Dashboard','New lead'], leads:['Broker Management','Leads','New lead'], quotes:['Broker Management','Quotes','New quote'], customers:['Broker Management','Customers','New customer'], orders:['Broker Management','Orders','New order'], dispatch:['Broker Management','Dispatch','Assign carrier'], carriers:['Broker Management','Carriers','New carrier'], finance:['Broker Management','Finance','Record payment'], communications:['Broker Management','Communications','New message'], documents:['Broker Management','Documents','Add document'], reports:['Broker Management','Reports','Export'], cms:['Website CMS','Pages & navigation','New page'], settings:['Administration','Settings','Save']
  };

  const persist = () => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {} };
  const record = (action, entity, entityId, detail) => {
    state.audit.unshift({ id:uid('AUD'), action, entity, entityId, detail, at:now() });
    state.audit = state.audit.slice(0, 300); persist();
  };
  const toast = (message) => {
    const el = document.createElement('div'); el.className='toast'; el.textContent=message; document.querySelector('#toastStack').appendChild(el); setTimeout(() => el.remove(), 2600);
  };
  const badge = (status) => {
    const s = String(status || '');
    const cls = /active|approved|published|received|signed|verified|delivered|settled/i.test(s) ? 'green' : /blocked|expired|cancelled|lost/i.test(s) ? 'red' : /review|follow|soon|queued|sourcing/i.test(s) ? 'amber' : /sent|viewed|quoted|transit/i.test(s) ? 'blue' : 'dark';
    return `<span class="badge ${cls}">${escapeHtml(s || '—')}</span>`;
  };
  const filterRows = (rows, fields) => !query ? rows : rows.filter((row) => fields.map((f) => row[f]).join(' ').toLowerCase().includes(query.toLowerCase()));

  function renderNav(){
    const nav = document.querySelector('#nav');
    nav.innerHTML = navGroups.map(([label,items]) => `<div class="nav-section">${label}</div>${items.map(([id,name,icon]) => `<button class="nav-item ${route===id?'active':''}" data-route="${id}"><span class="nav-icon">${icon}</span><span>${name}</span></button>`).join('')}`).join('');
    nav.querySelectorAll('[data-route]').forEach((button) => button.addEventListener('click', () => navigate(button.dataset.route)));
  }

  function navigate(next){
    route=next; query=''; document.querySelector('#globalSearch').value='';
    document.querySelector('#sidebar').classList.remove('open'); document.querySelector('#drawerBackdrop').hidden=true;
    render();
  }

  function render(){
    renderNav();
    const [crumb,title,action] = titles[route] || titles.dashboard;
    document.querySelector('#breadcrumb').textContent=crumb; document.querySelector('#pageTitle').textContent=title;
    const primary=document.querySelector('#primaryAction'); primary.textContent=action; primary.hidden=false;
    const app=document.querySelector('#app');
    const renderers={dashboard:renderDashboard,leads:renderLeads,quotes:renderQuotes,customers:renderCustomers,orders:renderOrders,dispatch:renderDispatch,carriers:renderCarriers,finance:renderFinance,communications:renderCommunications,documents:renderDocuments,reports:renderReports,cms:renderCms,settings:renderSettings};
    app.innerHTML=(renderers[route]||renderDashboard)(); bindPage();
  }

  function renderDashboard(){
    const openLeads=state.leads.filter(x=>!['Won','Lost'].includes(x.status));
    const activeQuotes=state.quotes.filter(x=>['Draft','Sent','Viewed'].includes(x.status));
    const inProgress=state.orders.filter(x=>!['Delivered','Settled','Cancelled'].includes(x.status));
    const dispatchAttention=state.orders.filter(x=>['Booked','Sourcing'].includes(x.status)&&!x.carrierId);
    const carrierAlerts=state.carriers.filter(x=>x.authorityStatus!=='Active'||x.insuranceStatus!=='Verified'||x.approval!=='Approved'||x.risk==='High');
    const outstanding=state.orders.reduce((sum,o)=>sum+o.customerPrice,0)-state.payments.filter(p=>p.type==='Customer'&&p.status==='Received').reduce((sum,p)=>sum+p.amount,0);
    return `<div class="grid kpis">
      ${[['Open leads',openLeads.length,'Sales pipeline'],['Active quotes',activeQuotes.length,'Awaiting decision'],['Orders in progress',inProgress.length,`${dispatchAttention.length} need dispatch`],['A/R exposure',money(outstanding),`${carrierAlerts.length} carrier alerts`]].map(([l,v,d])=>`<div class="card kpi"><span class="kpi-label">${l}</span><span class="kpi-value">${v}</span><span class="kpi-detail">${d}</span></div>`).join('')}
    </div>
    <div class="grid two">
      <div class="card"><div class="card-head"><h2>Recent activity</h2><span class="secondary">Audit trail</span></div><div class="card-body activity">${state.audit.slice(0,7).map(a=>`<div class="activity-row"><span class="activity-dot"></span><div class="activity-main"><div class="primary-text">${escapeHtml(a.detail)}</div><div class="secondary">${escapeHtml(a.entityId||a.entity)}</div></div><span class="activity-time">${relative(a.at)}</span></div>`).join('')}</div></div>
      <div class="card"><div class="card-head"><h2>Operational attention</h2><span class="secondary">Derived from current state</span></div><div class="card-body stat-list">
        <div class="stat-row"><div><strong>Dispatch queue</strong><div class="secondary">Orders without an assigned carrier</div></div><strong>${dispatchAttention.length}</strong></div>
        <div class="stat-row"><div><strong>Carrier compliance</strong><div class="secondary">Authority, insurance or approval review</div></div><strong>${carrierAlerts.length}</strong></div>
        <div class="stat-row"><div><strong>CMS drafts</strong><div class="secondary">Pages not published</div></div><strong>${state.cmsPages.filter(p=>p.status!=='Published').length}</strong></div>
        <div class="stat-row"><div><strong>Queued communication</strong><div class="secondary">Messages awaiting a production transport</div></div><strong>${state.communications.filter(c=>c.status==='Queued').length}</strong></div>
      </div></div>
    </div>`;
  }

  function tableCard(headers, rows, empty='No records found'){
    return `<div class="card"><div class="table-wrap"><table class="table"><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows||`<tr><td colspan="${headers.length}" class="empty">${empty}</td></tr>`}</tbody></table></div></div>`;
  }
  function toolbar(filters=''){return `<div class="toolbar"><div class="toolbar-group">${filters}</div><span class="secondary">${query?'Filtered results':'Current workspace data'}</span></div>`}

  function renderLeads(){
    const rows=filterRows(state.leads,['id','contactName','email','origin','destination','vehicle','source','status']);
    return toolbar(`<select class="control"><option>All statuses</option>${['New','Contacted','Quoted','Follow-up','Won','Lost'].map(x=>`<option>${x}</option>`).join('')}</select>`) + tableCard(['Lead','Route','Vehicle','Status','Estimate','Source','Updated',''], rows.map(x=>`<tr><td><button class="link-button" data-edit="lead" data-id="${x.id}">${escapeHtml(x.contactName)}</button><div class="secondary">${x.id} · ${escapeHtml(x.email||x.phone)}</div></td><td>${escapeHtml(x.origin)} → ${escapeHtml(x.destination)}</td><td>${escapeHtml(x.vehicle)}</td><td>${badge(x.status)}</td><td>${money(x.estimate)}</td><td>${escapeHtml(x.source)}</td><td>${relative(x.updatedAt)}</td><td><button class="button small" data-edit="lead" data-id="${x.id}">Edit</button></td></tr>`).join(''));
  }

  function renderQuotes(){
    const rows=filterRows(state.quotes,['id','leadId','route','status']);
    return toolbar() + tableCard(['Quote','Lead','Route','Customer price','Carrier est.','Margin','Status','Expires',''],rows.map(x=>`<tr><td><button class="link-button" data-edit="quote" data-id="${x.id}">${x.id}</button></td><td>${escapeHtml(x.leadId)}</td><td>${escapeHtml(x.route)}</td><td>${money(x.customerPrice)}</td><td>${money(x.carrierEstimate)}</td><td>${money(x.margin)}</td><td>${badge(x.status)}</td><td>${escapeHtml(x.expiresAt||'—')}</td><td><button class="button small" data-edit="quote" data-id="${x.id}">Edit</button></td></tr>`).join(''));
  }

  function renderCustomers(){
    const rows=filterRows(state.customers,['id','name','email','phone','status']);
    return toolbar() + tableCard(['Customer','Contact','Status','Leads','Orders','Updated',''],rows.map(x=>{const leads=state.leads.filter(l=>l.customerId===x.id).length;const orders=state.orders.filter(o=>o.customerId===x.id).length;return `<tr><td><button class="link-button" data-edit="customer" data-id="${x.id}">${escapeHtml(x.name)}</button><div class="secondary">${x.id}</div></td><td>${escapeHtml(x.email||'—')}<div class="secondary">${escapeHtml(x.phone||'')}</div></td><td>${badge(x.status)}</td><td>${leads}</td><td>${orders}</td><td>${relative(x.updatedAt)}</td><td><button class="button small" data-edit="customer" data-id="${x.id}">Edit</button></td></tr>`}).join(''));
  }

  function renderOrders(){
    const rows=filterRows(state.orders,['id','customerName','route','vehicle','status','carrierId']);
    return toolbar() + tableCard(['Order','Customer','Route / vehicle','Carrier','Status','Revenue','Carrier pay','Margin',''],rows.map(x=>`<tr><td><button class="link-button" data-edit="order" data-id="${x.id}">${x.id}</button></td><td>${escapeHtml(x.customerName)}</td><td>${escapeHtml(x.route)}<div class="secondary">${escapeHtml(x.vehicle)}</div></td><td>${escapeHtml(state.carriers.find(c=>c.id===x.carrierId)?.name||'Unassigned')}</td><td>${badge(x.status)}</td><td>${money(x.customerPrice)}</td><td>${money(x.carrierPay)}</td><td>${money(x.customerPrice-x.carrierPay)}</td><td><button class="button small" data-edit="order" data-id="${x.id}">Edit</button></td></tr>`).join(''));
  }

  function renderDispatch(){
    const statuses=['Sourcing','Carrier Selected','Pickup Scheduled','In Transit','Delivered'];
    return `<div class="notice">Carrier assignment is blocked unless authority is Active, insurance is Verified and approval is Approved. This mirrors the safety invariant identified in the Brokerpad reference.</div><div style="height:14px"></div><div class="pipeline">${statuses.map(status=>{const rows=state.orders.filter(o=>o.status===status);return `<div class="lane"><div class="lane-title"><span>${status}</span><span class="badge dark">${rows.length}</span></div>${rows.map(o=>`<div class="lane-card"><button class="link-button" data-edit="order" data-id="${o.id}">${o.id}</button><div class="secondary">${escapeHtml(o.route)}</div><div class="secondary">${escapeHtml(state.carriers.find(c=>c.id===o.carrierId)?.name||'No carrier')}</div></div>`).join('')||'<div class="secondary">No orders</div>'}</div>`}).join('')}</div>`;
  }

  function renderCarriers(){
    const rows=filterRows(state.carriers,['id','name','mc','dot','authorityStatus','insuranceStatus','approval','risk']);
    return toolbar() + tableCard(['Carrier','Authority','Insurance','Approval','Risk','Contact','Updated',''],rows.map(x=>`<tr><td><button class="link-button" data-edit="carrier" data-id="${x.id}">${escapeHtml(x.name)}</button><div class="secondary">${escapeHtml(x.mc)} · ${escapeHtml(x.dot)}</div></td><td>${badge(x.authorityStatus)}</td><td>${badge(x.insuranceStatus)}</td><td>${badge(x.approval)}</td><td>${badge(x.risk)}</td><td>${escapeHtml(x.email||x.phone)}</td><td>${relative(x.updatedAt)}</td><td><button class="button small" data-edit="carrier" data-id="${x.id}">Edit</button></td></tr>`).join(''));
  }

  function renderFinance(){
    const revenue=state.orders.reduce((s,o)=>s+o.customerPrice,0), carrierPay=state.orders.reduce((s,o)=>s+o.carrierPay,0), gross=revenue-carrierPay, received=state.payments.filter(p=>p.type==='Customer'&&p.status==='Received').reduce((s,p)=>s+p.amount,0);
    return `<div class="grid kpis">${[['Booked revenue',money(revenue),'Across orders'],['Carrier pay',money(carrierPay),'Expected payable'],['Gross margin',money(gross),revenue?`${Math.round(gross/revenue*100)}% booked margin`:'—'],['Customer payments',money(received),'Recorded receipts']].map(([l,v,d])=>`<div class="card kpi"><span class="kpi-label">${l}</span><span class="kpi-value">${v}</span><span class="kpi-detail">${d}</span></div>`).join('')}</div>${tableCard(['Payment','Order','Type','Amount','Status','Date'],state.payments.map(p=>`<tr><td>${p.id}</td><td>${p.orderId}</td><td>${p.type}</td><td>${money(p.amount)}</td><td>${badge(p.status)}</td><td>${p.date}</td></tr>`).join(''))}`;
  }

  function renderCommunications(){
    return `<div class="notice">Channels shown here are workflow records only. Email, SMS, WhatsApp or website chat require real provider credentials, webhooks and a server-side transport before a queued item can be considered delivered.</div><div style="height:14px"></div>${tableCard(['Conversation','Contact','Channel','Related','Status','Updated'],filterRows(state.communications,['subject','contact','channel','entity','status']).map(c=>`<tr><td><div class="primary-text">${escapeHtml(c.subject)}</div><div class="secondary">${c.id}</div></td><td>${escapeHtml(c.contact)}</td><td>${escapeHtml(c.channel)}</td><td>${escapeHtml(c.entity)}</td><td>${badge(c.status)}</td><td>${relative(c.updatedAt)}</td></tr>`).join(''))}`;
  }

  function renderDocuments(){
    return tableCard(['Document','Related to','Type','Status','Updated'],filterRows(state.documents,['name','entity','entityId','type','status']).map(d=>`<tr><td><div class="primary-text">${escapeHtml(d.name)}</div><div class="secondary">${d.id}</div></td><td>${escapeHtml(d.entity)} · ${escapeHtml(d.entityId)}</td><td>${escapeHtml(d.type)}</td><td>${badge(d.status)}</td><td>${relative(d.updatedAt)}</td></tr>`).join(''));
  }

  function renderReports(){
    const leadWon=state.leads.filter(l=>l.status==='Won').length, quoteAccepted=state.quotes.filter(q=>q.status==='Accepted').length, rev=state.orders.reduce((s,o)=>s+o.customerPrice,0), margin=state.orders.reduce((s,o)=>s+(o.customerPrice-o.carrierPay),0);
    const sources=[...new Set(state.leads.map(l=>l.source))].map(source=>({source,count:state.leads.filter(l=>l.source===source).length})).sort((a,b)=>b.count-a.count);
    return `<div class="grid three"><div class="card"><div class="card-head"><h2>Sales funnel</h2></div><div class="card-body stat-list"><div class="stat-row"><span>Leads</span><strong>${state.leads.length}</strong></div><div class="stat-row"><span>Quotes</span><strong>${state.quotes.length}</strong></div><div class="stat-row"><span>Accepted quotes</span><strong>${quoteAccepted}</strong></div><div class="stat-row"><span>Won leads</span><strong>${leadWon}</strong></div></div></div><div class="card"><div class="card-head"><h2>Brokerage economics</h2></div><div class="card-body stat-list"><div class="stat-row"><span>Booked revenue</span><strong>${money(rev)}</strong></div><div class="stat-row"><span>Gross margin</span><strong>${money(margin)}</strong></div><div class="stat-row"><span>Margin rate</span><strong>${rev?Math.round(margin/rev*100):0}%</strong></div></div></div><div class="card"><div class="card-head"><h2>Lead sources</h2></div><div class="card-body stat-list">${sources.map(s=>`<div class="stat-row"><span>${escapeHtml(s.source)}</span><strong>${s.count}</strong></div>`).join('')}</div></div></div>`;
  }

  function renderCms(){
    const pages=filterRows(state.cmsPages,['title','slug','status','seoTitle','description']);
    return `<div class="grid two"><div>${tableCard(['Page','Path','Status','SEO title','Updated',''],pages.map(p=>`<tr><td><button class="link-button" data-edit="page" data-id="${p.id}">${escapeHtml(p.title)}</button></td><td>${escapeHtml(p.slug)}</td><td>${badge(p.status)}</td><td>${escapeHtml(p.seoTitle)}</td><td>${relative(p.updatedAt)}</td><td><button class="button small" data-edit="page" data-id="${p.id}">Edit</button></td></tr>`).join(''))}</div><div class="card"><div class="card-head"><h2>CMS boundary</h2></div><div class="card-body"><div class="notice">The current repository does not contain the live site's HTML/CSS/JS; it embeds <strong>carlogconnection.com</strong>. This CMS therefore establishes the editorial model and admin workflow without pretending that changes have been published to the remote origin. A production connector must write to the real site's content backend.</div><div style="height:16px"></div><div class="stat-list"><div class="stat-row"><span>Published pages</span><strong>${state.cmsPages.filter(p=>p.status==='Published').length}</strong></div><div class="stat-row"><span>Draft pages</span><strong>${state.cmsPages.filter(p=>p.status==='Draft').length}</strong></div><div class="stat-row"><span>Navigation items</span><strong>${state.navItems.filter(n=>n.visible).length}</strong></div></div></div></div></div>`;
  }

  function renderSettings(){
    const tabs=[['company','Company'],['users','Users'],['automations','Automations'],['integrations','Integrations'],['security','Security']];
    let body='';
    if(settingsTab==='company') body=`<div class="card"><div class="card-body"><form id="companyForm" class="form-grid"><div class="form-field"><label>Company name</label><input name="name" value="${escapeHtml(state.company.name)}"></div><div class="form-field"><label>Website</label><input name="website" value="${escapeHtml(state.company.website)}"></div><div class="form-field"><label>Email</label><input name="email" value="${escapeHtml(state.company.email)}"></div><div class="form-field"><label>Phone</label><input name="phone" value="${escapeHtml(state.company.phone)}"></div><div class="form-field"><label>Timezone</label><input name="timezone" value="${escapeHtml(state.company.timezone)}"></div><div class="form-field full"><button class="button primary" type="submit">Save company settings</button></div></form></div></div>`;
    if(settingsTab==='users') body=tableCard(['User','Email','Role','Status'],state.users.map(u=>`<tr><td>${escapeHtml(u.name)}</td><td>${escapeHtml(u.email||'—')}</td><td>${escapeHtml(u.role)}</td><td>${badge(u.status)}</td></tr>`).join(''));
    if(settingsTab==='automations') body=`<div class="notice">Automation definitions are stored locally. Execution requires a production scheduler/worker.</div><div style="height:14px"></div>${tableCard(['Automation','Trigger','Action','Local state'],state.automations.map(a=>`<tr><td>${escapeHtml(a.name)}</td><td>${escapeHtml(a.trigger)}</td><td>${escapeHtml(a.action)}</td><td>${badge(a.enabled?'Enabled locally':'Disabled')}</td></tr>`).join(''))}`;
    if(settingsTab==='integrations') body=`<div class="notice">Secrets must never be stored in browser localStorage. The current catalog records readiness only.</div><div style="height:14px"></div>${tableCard(['Integration','Category','Readiness'],state.integrations.map(i=>`<tr><td>${escapeHtml(i.name)}</td><td>${escapeHtml(i.category)}</td><td>${badge(i.status)}</td></tr>`).join(''))}`;
    if(settingsTab==='security') body=`<div class="grid two"><div class="card"><div class="card-head"><h2>Security baseline</h2></div><div class="card-body stat-list"><div class="stat-row"><span>Authentication</span><strong>Required for production</strong></div><div class="stat-row"><span>Role-based access</span><strong>Model only</strong></div><div class="stat-row"><span>Audit trail</span><strong>${state.audit.length} local events</strong></div><div class="stat-row"><span>Secret storage</span><strong>Server-side only</strong></div></div></div><div class="card"><div class="card-head"><h2>Current runtime</h2></div><div class="card-body"><div class="notice">This admin implementation is intentionally a static functional prototype because the repository has no backend. Before real brokerage data is used, add authenticated users, tenant isolation, a database, server-side integrations and durable audit logging.</div></div></div></div>`;
    return `<div class="settings-tabs">${tabs.map(([id,label])=>`<button class="settings-tab ${settingsTab===id?'active':''}" data-settings-tab="${id}">${label}</button>`).join('')}</div>${body}`;
  }

  function field(name,label,value='',type='text',options=[]){
    if(type==='select') return `<div class="form-field"><label>${label}</label><select name="${name}">${options.map(o=>`<option ${String(o)===String(value)?'selected':''}>${escapeHtml(o)}</option>`).join('')}</select></div>`;
    return `<div class="form-field"><label>${label}</label><input name="${name}" type="${type}" value="${escapeHtml(value)}"></div>`;
  }

  function openModal(kind,id){
    const layer=document.querySelector('#modalLayer'); layer.hidden=false;
    const configs={lead:{list:'leads',prefix:'LD',title:'Lead'},quote:{list:'quotes',prefix:'QT',title:'Quote'},customer:{list:'customers',prefix:'CUS',title:'Customer'},order:{list:'orders',prefix:'ORD',title:'Order'},carrier:{list:'carriers',prefix:'CAR',title:'Carrier'},page:{list:'cmsPages',prefix:'PAGE',title:'CMS page'}};
    const cfg=configs[kind]; if(!cfg)return;
    const current=state[cfg.list].find(x=>x.id===id)||{}; const title=`${id?'Edit':'New'} ${cfg.title}`; let body='';
    if(kind==='lead') body=[field('contactName','Contact name',current.contactName),field('email','Email',current.email,'email'),field('phone','Phone',current.phone),field('origin','Origin',current.origin),field('destination','Destination',current.destination),field('vehicle','Vehicle',current.vehicle),field('estimate','Estimate',current.estimate||0,'number'),field('source','Source',current.source||'Website'),field('status','Status',current.status||'New','select',['New','Contacted','Quoted','Follow-up','Won','Lost'])].join('');
    if(kind==='quote') body=[field('leadId','Lead',current.leadId),field('route','Route',current.route),field('customerPrice','Customer price',current.customerPrice||0,'number'),field('carrierEstimate','Carrier estimate',current.carrierEstimate||0,'number'),field('status','Status',current.status||'Draft','select',['Draft','Sent','Viewed','Accepted','Expired','Cancelled']),field('expiresAt','Expires',current.expiresAt||'','date')].join('');
    if(kind==='customer') body=[field('name','Name',current.name),field('email','Email',current.email,'email'),field('phone','Phone',current.phone),field('status','Status',current.status||'Active','select',['Active','Inactive'])].join('');
    if(kind==='order') body=[field('customerName','Customer',current.customerName),field('route','Route',current.route),field('vehicle','Vehicle',current.vehicle),field('customerPrice','Customer price',current.customerPrice||0,'number'),field('carrierPay','Carrier pay',current.carrierPay||0,'number'),`<div class="form-field"><label>Carrier</label><select name="carrierId"><option value="">Unassigned</option>${state.carriers.map(c=>`<option value="${c.id}" ${c.id===current.carrierId?'selected':''}>${escapeHtml(c.name)}</option>`).join('')}</select></div>`,field('status','Status',current.status||'Sourcing','select',['Booked','Sourcing','Carrier Selected','Pickup Scheduled','In Transit','Delivered','Settled','Cancelled']),field('pickupStart','Pickup date',current.pickupStart||'','date'),field('deliveryEta','Delivery ETA',current.deliveryEta||'','date')].join('');
    if(kind==='carrier') body=[field('name','Carrier name',current.name),field('mc','MC number',current.mc),field('dot','USDOT',current.dot),field('email','Email',current.email,'email'),field('phone','Phone',current.phone),field('authorityStatus','Authority',current.authorityStatus||'Active','select',['Active','Inactive','Revoked']),field('insuranceStatus','Insurance',current.insuranceStatus||'Pending','select',['Verified','Pending','Expires soon','Expired']),field('approval','Approval',current.approval||'Review','select',['Approved','Review','Blocked']),field('risk','Risk',current.risk||'Low','select',['Low','Medium','High'])].join('');
    if(kind==='page') body=[field('title','Page title',current.title),field('slug','Path',current.slug||'/'),field('status','Status',current.status||'Draft','select',['Draft','Published','Archived']),field('seoTitle','SEO title',current.seoTitle),`<div class="form-field full"><label>Meta description</label><textarea name="description" rows="4">${escapeHtml(current.description||'')}</textarea></div>`].join('');
    layer.innerHTML=`<div class="modal" role="dialog" aria-modal="true"><div class="modal-head"><div><h2>${title}</h2><div class="secondary">${id||'Create a new record'}</div></div><button class="icon-button" data-modal-close>×</button></div><form id="recordForm"><div class="modal-body"><div class="form-grid">${body}</div></div><div class="modal-foot"><button type="button" class="button" data-modal-close>Cancel</button><button type="submit" class="button primary">Save</button></div></form></div>`;
    layer.querySelectorAll('[data-modal-close]').forEach(b=>b.addEventListener('click',closeModal));
    layer.querySelector('#recordForm').addEventListener('submit',(event)=>{event.preventDefault();const values=Object.fromEntries(new FormData(event.currentTarget).entries());saveRecord(kind,id,values);closeModal();render();});
  }
  function closeModal(){const layer=document.querySelector('#modalLayer');layer.hidden=true;layer.innerHTML='';}

  function saveRecord(kind,id,values){
    const config={lead:['leads','LD'],quote:['quotes','QT'],customer:['customers','CUS'],order:['orders','ORD'],carrier:['carriers','CAR'],page:['cmsPages','PAGE']}[kind];
    const [list,prefix]=config; const existing=state[list].find(x=>x.id===id); const next={...(existing||{}),...values,id:existing?.id||uid(prefix),updatedAt:now()};
    ['estimate','customerPrice','carrierEstimate','carrierPay'].forEach(k=>{if(k in next) next[k]=Math.max(0,Number(next[k])||0)});
    if(kind==='quote') next.margin=Math.max(0,next.customerPrice-next.carrierEstimate);
    if(kind==='order' && next.carrierId){
      const carrier=state.carriers.find(c=>c.id===next.carrierId);
      const eligible=carrier&&carrier.authorityStatus==='Active'&&carrier.insuranceStatus==='Verified'&&carrier.approval==='Approved'&&carrier.risk!=='High';
      if(!eligible){toast('Carrier is not eligible for dispatch. Assignment was cleared.');next.carrierId='';if(next.status==='Carrier Selected')next.status='Sourcing';}
    }
    if(existing) state[list]=state[list].map(x=>x.id===id?next:x); else state[list].unshift(next);
    record(`${kind}.${existing?'updated':'created'}`,kind,next.id,`${kind[0].toUpperCase()+kind.slice(1)} ${existing?'updated':'created'} · ${next.id}`); persist(); toast(`${kind[0].toUpperCase()+kind.slice(1)} saved`);
  }

  function bindPage(){
    document.querySelectorAll('[data-edit]').forEach(b=>b.addEventListener('click',()=>openModal(b.dataset.edit,b.dataset.id)));
    document.querySelectorAll('[data-settings-tab]').forEach(b=>b.addEventListener('click',()=>{settingsTab=b.dataset.settingsTab;render();}));
    document.querySelector('#companyForm')?.addEventListener('submit',(event)=>{event.preventDefault();state.company={...state.company,...Object.fromEntries(new FormData(event.currentTarget).entries())};record('settings.company.updated','settings','company','Company settings updated');persist();toast('Company settings saved');});
  }

  document.querySelector('#primaryAction').addEventListener('click',()=>{
    const map={dashboard:'lead',leads:'lead',quotes:'quote',customers:'customer',orders:'order',dispatch:'order',carriers:'carrier',cms:'page'};
    if(map[route]) openModal(map[route]);
    else if(route==='reports'){
      const data=JSON.stringify({generatedAt:now(),leads:state.leads,quotes:state.quotes,orders:state.orders,carriers:state.carriers},null,2);
      const blob=new Blob([data],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='carlog-report.json'; a.click(); URL.revokeObjectURL(a.href); record('report.exported','report','brokerage','Brokerage report exported'); toast('Report exported');
    } else if(route==='settings'){persist();toast('Settings are saved automatically');}
    else toast('Workflow action is modeled but requires a production backend');
  });
  document.querySelector('#globalSearch').addEventListener('input',(event)=>{query=event.target.value.trim();render();});
  document.querySelector('#menuButton').addEventListener('click',()=>{document.querySelector('#sidebar').classList.toggle('open');document.querySelector('#drawerBackdrop').hidden=!document.querySelector('#sidebar').classList.contains('open');});
  document.querySelector('#drawerBackdrop').addEventListener('click',()=>{document.querySelector('#sidebar').classList.remove('open');document.querySelector('#drawerBackdrop').hidden=true;});
  document.querySelector('#modalLayer').addEventListener('click',(event)=>{if(event.target.id==='modalLayer')closeModal();});
  window.addEventListener('keydown',(event)=>{if(event.key==='Escape')closeModal();});

  render();
})();
