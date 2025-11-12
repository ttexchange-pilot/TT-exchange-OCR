(function(){

function setRateModeTag(){
  const tag = document.getElementById('rate-mode-tag');
  if(!tag) return;
  const mode = document.querySelector('.pill.active')?.dataset.mode || 'fx';
  const label = (mode==='fx' ? 'ลูกค้ามี FX — ใช้เรท BUY' : 'ลูกค้ามี THB — ใช้เรท SELL');
  tag.textContent = label.replace(' — ', ': ');
  const rtag = document.getElementById('r-rate-mode'); if(rtag) rtag.textContent = label.split(' — ')[1];
}

  const $=(s,p=document)=>p.querySelector(s);
  const $$=(s,p=document)=>Array.from(p.querySelectorAll(s));
  const fmtTHB=n=>new Intl.NumberFormat('th-TH',{style:'currency',currency:'THB'}).format(+n||0);
  const CCY_SEED=[{ccy:'USD',buy:32.15,sell:32.70},{ccy:'EUR',buy:37.15,sell:37.80},{ccy:'JPY',buy:0.2070,sell:0.2140},{ccy:'GBP',buy:42.25,sell:42.90},{ccy:'AUD',buy:20.80,sell:21.50}];
  const FLAGS={USD:'🇺🇸',EUR:'🇪🇺',JPY:'🇯🇵',GBP:'🇬🇧',AUD:'🇦🇺',SGD:'🇸🇬',CHF:'🇨🇭',HKD:'🇭🇰',CNY:'🇨🇳',KRW:'🇰🇷'};

  function branchKey(company, branch){ return company + '|' + branch; }

  const API={
    async login(role,pin){
      const pins=window.TTConfig?.pins||{staff:'1111',manager:'5599',admin:'8888'};
      return (pin===pins[role])?{ok:true,token:'demo'}:{ok:false,error:'PIN ไม่ถูกต้อง'};
    },
    async getRates(company, branch){
      const key=branchKey(company, branch);
      try{
        const r=await fetch(`${window.TTConfig.apiBase}/rates?branch=${encodeURIComponent(key)}`);
        if(r.ok) return await r.json();
      }catch(e){}
      const map=JSON.parse(localStorage.getItem('tt_rates_by_branch_v2')||'{}');
      return map[key] || CCY_SEED;
    },
    async saveRates(company, branch, list){
      const key=branchKey(company, branch);
      try{
        const r=await fetch(`${window.TTConfig.apiBase}/rates`,{
          method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({branch:key, list})
        });
        if(r.ok) return true;
      }catch(e){}
      const map=JSON.parse(localStorage.getItem('tt_rates_by_branch_v2')||'{}'); map[key]=list;
      localStorage.setItem('tt_rates_by_branch_v2', JSON.stringify(map)); return true;
    },
    async addLog(row){
      try{
        const r=await fetch(`${window.TTConfig.apiBase}/transactions`,{
          method:'POST',headers:{'Content-Type':'application/json'}, body:JSON.stringify(row)
        });
        if(r.ok) return true;
      }catch(e){}
      const logs=JSON.parse(localStorage.getItem('tt_logs_v2')||'[]'); logs.unshift(row);
      localStorage.setItem('tt_logs_v2', JSON.stringify(logs)); return true;
    },
    async listLogs(company, branch){
      try{
        const r=await fetch(`${window.TTConfig.apiBase}/transactions?branch=*`);
        if(r.ok){
          let rows=await r.json();
          if(company && company!=='*') rows=rows.filter(x=>x.company===company);
          if(branch && branch!=='*') rows=rows.filter(x=>x.branch===branch);
          return rows;
        }
      }catch(e){}
      let rows=JSON.parse(localStorage.getItem('tt_logs_v2')||'[]');
      if(company && company!=='*') rows=rows.filter(x=>x.company===company);
      if(branch && branch!=='*') rows=rows.filter(x=>x.branch===branch);
      return rows;
    },
    async clearLogs(company, branch){
      let rows=JSON.parse(localStorage.getItem('tt_logs_v2')||'[]');
      rows=rows.filter(x=> !( (company==='*'||x.company===company) && (branch==='*'||x.branch===branch) ));
      localStorage.setItem('tt_logs_v2', JSON.stringify(rows)); return true;
    }
  };

  let SESSION={company:null,branch:null,role:null,token:null,staffName:'',staffCode:''};

  document.addEventListener('DOMContentLoaded',()=>{
    initCompanyBranchSelectors();

    document.addEventListener('keydown',e=>{
      if(e.key==='Enter'&&$('#login-screen').classList.contains('active')) $('#login-btn').click();
      if(e.key==='F2'){ e.preventDefault(); $('#calc')?.click(); }
      if(e.key==='F9'){ e.preventDefault(); $('#make-receipt')?.click(); }
    });

    $$('.tab-btn').forEach(btn=>btn.addEventListener('click',()=>{
      if(!$('#app-screen').classList.contains('active')) return;
      $$('.tab-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      $$('.section').forEach(s=>s.classList.remove('active'));
      $('#'+btn.dataset.tab).classList.add('active');
      if(btn.dataset.tab==='logs') renderLogs();
      if(btn.dataset.tab==='rates') renderRatesTable();
    }));

    $('#login-btn').addEventListener('click', async ()=>{
      const role=$('#roleSel').value, pin=$('#pin').value.trim();
      const company=$('#companySel').value, branch=$('#branchSel').value;
      const staffName=$('#staffName').value.trim(), staffCode=$('#staffCode').value.trim();
      const resp=await API.login(role,pin);
      if(!resp.ok){ $('#login-error').textContent=resp.error||'เข้าสู่ระบบไม่สำเร็จ'; return; }
      SESSION={company,branch,role,token:resp.token,staffName,staffCode};
      $('#company-tag').textContent=company; $('#branch-tag').textContent=branch; $('#role-tag').textContent=role.toUpperCase();
      $('#login-screen').classList.remove('active'); $('#app-screen').classList.add('active');
      $('#rates-company').textContent=company; $('#rates-branch').textContent=branch;
      applyHeader(company, branch);
      initApp();
    });

    $('#logout').addEventListener('click',()=>location.reload());

    $$('.pill').forEach(p=>p.addEventListener('click',()=>{
      $$('.pill').forEach(x=>x.classList.remove('active')); p.classList.add('active');
      $('#amtLabel').textContent=p.dataset.mode==='fx'?'จำนวน FX':'ลูกค้ามี THB';
      loadDefaultRate();
      setRateModeTag();
    compute();
    }));

    setRateModeTag();
    $('#ccySearch').addEventListener('input', syncCCYList);
    $('#rate').addEventListener('input', compute);
    $('#amt').addEventListener('input', compute);
    $('#calc').addEventListener('click', compute);
    
// --- Rebind make-receipt to include multi-lines (patched) ---
window.addEventListener('DOMContentLoaded', ()=>{
  const btn = document.getElementById('make-receipt');
  if(!btn) return;
  const clone = btn.cloneNode(true);
  btn.replaceWith(clone);
  clone.addEventListener('click', (ev)=>{
    // First, compute & fill receipt from any multi-lines
    const lines = readLines();
    fillReceiptFromLines(lines);
  });
  // Re-attach the original listener(s) by triggering the same id selector registration again
  // We try to call the same line that originally did: $('#make-receipt').addEventListener('click', makeReceipt);
  try{
    clone.addEventListener('click', makeReceipt);
  }catch(e){}
});

  });

  function initCompanyBranchSelectors(){
    const cs=$('#companySel'), bs=$('#branchSel');
    const companies=window.TTConfig.companies||{};
    cs.innerHTML=''; Object.keys(companies).forEach(c=>{ const o=document.createElement('option'); o.value=o.textContent=c; cs.appendChild(o); });
    cs.onchange=function(){ refreshBranches(); };
    function refreshBranches(){
      const c=cs.value; const branches=companies[c]?companies[c].branches:{};
      bs.innerHTML=''; Object.keys(branches).forEach(b=>{ const o=document.createElement('option'); o.value=o.textContent=b; bs.appendChild(o); });
    }
    refreshBranches();
  }

  async function initApp(){
    await ensureRates();
    syncCCYList(); loadDefaultRate();
    renderRatesTable(); renderLogs();
    $('#r-company').textContent = SESSION.company;
    $('#r-branch').textContent = SESSION.branch;
    $('#r-staff').textContent = (SESSION.staffName||'-') + (SESSION.staffCode?(' ('+SESSION.staffCode+')'):'')
  }

  function applyHeader(company, branch){
    const H=(window.TTConfig.companies?.[company]?.branches?.[branch])||{company, address:'', contact:''};
    $('#r-company-name').textContent = H.company || company;
    $('#r-company-addr').textContent = H.address || '';
    $('#r-company-contact').textContent = H.contact || '';
  }

  async function ensureRates(){
    const list = await API.getRates(SESSION.company, SESSION.branch);
    await API.saveRates(SESSION.company, SESSION.branch, list);
  }

  async function syncCCYList(){
    const q = ($('#ccySearch').value||'').trim().toUpperCase();
    const list = await API.getRates(SESSION.company, SESSION.branch);
    const sel = $('#ccyList'); sel.innerHTML='';
    list.filter(r=>!q || r.ccy.includes(q)).forEach(r=>{
      const flag = FLAGS[r.ccy] ? FLAGS[r.ccy] + ' ' : '';
      const o=document.createElement('option'); o.value=r.ccy; o.textContent=flag + r.ccy; sel.appendChild(o);
    });
    sel.onchange=loadDefaultRate;
    if(sel.options.length) sel.selectedIndex=0;
    loadDefaultRate();
  }

  async function loadDefaultRate(){
    const ccy = $('#ccyList').value;
    const list = await API.getRates(SESSION.company, SESSION.branch);
    const r = list.find(x=>x.ccy===ccy) || list[0];
    if(r){ const mode=$('.pill.active')?.dataset.mode||'fx'; $('#rate').value = (+(mode==='fx'?r.buy:r.sell)).toFixed(4);}
    setRateModeTag();
    compute();
  }

  function compute(){
    const mode = $('.pill.active')?.dataset.mode || 'fx';
    const rate = parseFloat($('#rate').value||'0');
    const amt = parseFloat($('#amt').value||'0');
    if(mode==='fx'){
      $('#thb').value = (amt*rate||0).toFixed(2);
    }else{
      $('#thb').value = (amt||0).toFixed(2);
      const fx = rate? (amt/rate) : 0;
      $('#amt').placeholder = `≈ ${(fx||0).toFixed(4)} FX`;
    }
  }

  async function makeReceipt(){
    const mode = $('.pill.active')?.dataset.mode || 'fx';
    const ccy = $('#ccyList').value || 'USD';
    const name = $('#c-name').value.trim();
    const cid = $('#c-id').value.trim();
    const phone = $('#c-phone').value.trim();

    let amt = parseFloat($('#amt').value||'0');
    const rate = parseFloat($('#rate').value||'0');
    let thb = parseFloat($('#thb').value||'0');

    const special = $('#special').checked;
    const reason = $('#special-reason').value.trim();
    const approverPin = $('#approver-pin').value.trim();
    const pins = window.TTConfig?.pins || {};
    const isMgr = SESSION.role==='manager' || SESSION.role==='admin';

    if(special){
      if(!reason){ alert('กรุณากรอกเหตุผลเรทพิเศษ'); return; }
      if(!isMgr || approverPin !== (pins.manager || '5599')){ alert('PIN ผู้อนุมัติไม่ถูกต้อง'); return; }
    }

    if(mode==='thb' && rate){ amt = thb / rate; }
    if(!rate || !(amt>0)){ alert('กรอกข้อมูลให้ครบ'); return; }

    const no = 'TT' + String(Date.now()).slice(-6);
    $('#r-no').textContent = no;
    $('#r-time').textContent = new Date().toLocaleString('th-TH');
    $('#r-cust').textContent = name || '-';
    $('#r-cid').textContent = cid || '-';
    $('#r-ccy').textContent = ccy;
    $('#r-amt').textContent = (amt||0).toFixed(4);
    $('#r-rate').textContent = rate.toFixed(4);
    $('#r-thb').textContent = fmtTHB(amt*rate);
    $('#r-special').textContent = special ? `ใช่ (${reason})` : 'ไม่ใช่';

    await API.addLog({
      no, ts:Date.now(),
      company: SESSION.company, branch: SESSION.branch,
      staff: SESSION.staffName, staffCode: SESSION.staffCode,
      cust: name, cid, phone, ccy, amt, rate, thb: amt*rate, special, reason
    });
    renderLogs();

    $$('.tab-btn').forEach(b=>b.classList.remove('active'));
    document.querySelector('.tab-btn[data-tab="receipt"]').classList.add('active');
    $$('.section').forEach(s=>s.classList.remove('active'));
    $('#receipt').classList.add('active');
  }

  async function renderRatesTable(){
    const tbody = $('#rates-body'); if(!tbody) return;
    const list = await API.getRates(SESSION.company, SESSION.branch);
    const isMgr = SESSION.role==='manager' || SESSION.role==='admin';
    tbody.innerHTML='';
    list.forEach((r,i)=>{
      const tr=document.createElement('tr');
      tr.innerHTML = `
        <td>${r.ccy}</td>
        <td><input ${!isMgr?'disabled':''} type="number" step="0.0001" value="${r.buy}" data-i="${i}" data-k="buy"/></td>
        <td><input ${!isMgr?'disabled':''} type="number" step="0.0001" value="${r.sell}" data-i="${i}" data-k="sell"/></td>
        <td class="center"><button class="btn danger" data-del="${i}" ${!isMgr?'disabled':''}>ลบ</button></td>`;
      tbody.appendChild(tr);
    });
    if(isMgr){
      tbody.querySelectorAll('input').forEach(inp=>{
        inp.addEventListener('change', async ()=>{
          const i=+inp.dataset.i, k=inp.dataset.k;
          const list = await API.getRates(SESSION.company, SESSION.branch);
          list[i][k]=parseFloat(inp.value||'0');
          await API.saveRates(SESSION.company, SESSION.branch, list);
        });
      });
      tbody.querySelectorAll('button[data-del]').forEach(btn=>{
        btn.addEventListener('click', async ()=>{
          const i=+btn.dataset.del;
          const list = await API.getRates(SESSION.company, SESSION.branch);
          list.splice(i,1);
          await API.saveRates(SESSION.company, SESSION.branch, list);
          renderRatesTable(); syncCCYList();
        });
      });

      $('#add-rate').onclick= async ()=>{
        const ccy=(prompt('Currency (e.g., USD)')||'').toUpperCase().trim(); if(!ccy) return;
        const buy=parseFloat(prompt('Buy rate')||'0');
        const sell=parseFloat(prompt('Sell rate')||'0');
        const list = await API.getRates(SESSION.company, SESSION.branch); list.push({ccy,buy,sell});
        await API.saveRates(SESSION.company, SESSION.branch, list); syncCCYList(); renderRatesTable();
      };
      $('#reset-rates').onclick= async ()=>{ if(confirm('คืนค่าเรทเริ่มต้นสำหรับสาขานี้?')){
        await API.saveRates(SESSION.company, SESSION.branch, CCY_SEED); syncCCYList(); renderRatesTable(); loadDefaultRate();
      }};
    }
  }

  async function renderLogs(){
    const tbody = $('#log-body'); if(!tbody) return;
    const fc = $('#filter-company'), fb = $('#filter-branch');
    if(!fc.dataset.ready){
      const companies = window.TTConfig.companies || {};
      fc.innerHTML = '<option value="*">โซน</option>' + Object.keys(companies).map(c=>`<option>${c}</option>`).join('');
      fc.dataset.ready='1';
      fc.onchange=()=>populateBranchFilter();
    }
    function populateBranchFilter(){
      const selC = fc.value;
      const companies = window.TTConfig.companies || {};
      let branches = [];
      if(selC==='*'){
        Object.values(companies).forEach(v=>branches = branches.concat(Object.keys(v.branches||{})));
      }else{
        branches = Object.keys(companies[selC]?.branches||{});
      }
      fb.innerHTML = '<option value="*">ทุกสาขา</option>' + branches.map(b=>`<option>${b}</option>`).join('');
    }
    if(!fb.dataset.ready){ populateBranchFilter(); fb.dataset.ready='1'; }

    const rows = await API.listLogs(fc.value||'*', fb.value||'*');
    tbody.innerHTML='';
    rows.forEach(r=>{
      const tr=document.createElement('tr');
      tr.innerHTML = `<td>${r.no}</td>
        <td>${new Date(r.ts).toLocaleString('th-TH')}</td>
        <td>${r.company}</td>
        <td>${r.branch}</td>
        <td>${r.cust||'-'}</td>
        <td>${r.ccy}</td>
        <td>${(+r.amt).toFixed(4)}</td>
        <td>${(+r.rate).toFixed(4)}</td>
        <td>${fmtTHB(r.thb)}</td>
        <td>${r.special?'ใช่':''}</td>`;
      tbody.appendChild(tr);
    });
    $('#export').onclick=()=>exportCSV(rows);
    $('#clear-logs').onclick= async ()=>{
      if(confirm('ล้างรายการตามตัวกรองปัจจุบัน?')){
        await API.clearLogs(fc.value||'*', fb.value||'*');
        renderLogs();
      }
    };
  }

  
function fillReceiptFromLines(lines){
  // Hide single fields if multiple lines; otherwise use first line
  const hasMulti = lines.length>1;
  const rItems = $('#r-items'); const rBody=$('#r-items-body'); const rSum=$('#r-sum'); const rTotal=$('#r-total');
  if(rItems && rBody && rSum && rTotal){
    rBody.innerHTML = '';
    if(lines.length){
      rItems.style.display = 'table';
      rTotal.style.display = 'flex';
      let sum=0;
      lines.forEach(row=>{
        const tr=document.createElement('tr');
        tr.innerHTML = `<td>${row.ccy}</td><td style="text-align:right">${row.amt}</td><td style="text-align:right">${row.rate}</td><td style="text-align:right">${row.thb.toFixed(2)}</td>`;
        rBody.appendChild(tr);
        sum += row.thb;
      });
      rSum.textContent = sum.toFixed(2);
    }else{
      rItems.style.display='none'; rTotal.style.display='none';
    }
  }
  // Toggle single-value fields
  ['r-ccy','r-amt','r-rate','r-thb','r-special'].forEach(id=>{
    const el = document.getElementById(id);
    if(el) el.closest('div').style.display = hasMulti? 'none':'block';
  });
}

function exportCSV(rows){
    const cols=['no','ts','company','branch','staff','staffCode','cust','cid','phone','ccy','amt','rate','thb','special','reason'];
    const lines=[cols.join(',')].concat(
      rows.map(r=>[r.no,r.ts,esc(r.company),esc(r.branch),esc(r.staff),esc(r.staffCode),esc(r.cust),esc(r.cid),esc(r.phone),r.ccy,r.amt,r.rate,r.thb,r.special,r.reason?('\"'+String(r.reason).replace(/\"/g,'\"\"')+'\"'):''].join(','))
    );
    const blob=new Blob([lines.join('\n')],{type:'text/csv'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.download='logs.csv'; a.click();
    URL.revokeObjectURL(url);
  }
  function esc(s){ if(s==null) return ''; s=String(s); if(s.includes(',')||s.includes('\"')) return '\"'+s.replace(/\"/g,'\"\"')+'\"'; return s; }

// --- Multi-currency lines (patched) ---
function ensureLineTableVisible(){
  const tbl=$('#line-table'), total=$('#line-total');
  if(!tbl || !total) return;
  const hasRows = $('#line-body')?.children.length>0;
  tbl.style.display = hasRows?'table':'none';
  total.style.display = hasRows?'flex':'none';
}
function addLine(initial){
  const tbody = $('#line-body'); if(!tbody) return;
  const tr = document.createElement('tr');
  const ccy = initial?.ccy || ($('#ccySearch')?.value || '').toUpperCase();
  const rate = initial?.rate || parseFloat($('#rate')?.value||'0') || 0;
  const amt  = initial?.amt  || parseFloat($('#amt')?.value||'0')  || 0;
  tr.innerHTML = `
    <td><input class="l-ccy" value="${ccy||''}" style="width:80px"/></td>
    <td style="text-align:right"><input class="l-amt" type="number" step="0.0001" value="${amt||''}" /></td>
    <td style="text-align:right"><input class="l-rate" type="number" step="0.0001" value="${rate||''}" /></td>
    <td style="text-align:right"><input class="l-thb" type="number" step="0.01" readonly /></td>
    <td><button class="btn" data-del>ลบ</button></td>
  `;
  tbody.appendChild(tr);
  tr.querySelectorAll('.l-amt,.l-rate').forEach(el=>el.addEventListener('input', computeLines));
  tr.querySelector('[data-del]').addEventListener('click', ()=>{ tr.remove(); computeLines(); ensureLineTableVisible(); });
  computeLines(); ensureLineTableVisible();
}
function clearLines(){ const b=$('#line-body'); if(b){ b.innerHTML=''; computeLines(); ensureLineTableVisible(); } }
function readLines(){
  const rows=[]; $$('.l-ccy', $('#line-body')).forEach((ccyEl, i)=>{
    const tr = ccyEl.closest('tr');
    const ccy = ccyEl.value.toUpperCase().trim();
    const amt = parseFloat(tr.querySelector('.l-amt')?.value||'0')||0;
    const rate= parseFloat(tr.querySelector('.l-rate')?.value||'0')||0;
    const thb = +(amt*rate).toFixed(2);
    if(ccy && (amt||rate)) rows.push({ccy, amt, rate, thb});
  });
  return rows;
}
function computeLines(){
  const rows = readLines();
  const body = $('#line-body');
  if(body){
    const trs = Array.from(body.children);
    rows.forEach((r,i)=>{
      const tr=trs[i];
      if(tr){
        tr.querySelector('.l-thb').value = r.thb.toFixed(2);
      }
    });
  }
  const sum = rows.reduce((a,b)=>a+b.thb,0);
  const sumEl=$('#line-sum'); if(sumEl){ sumEl.textContent = sum.toFixed(2); }
  // Reflect to single THB box for convenience
  const thbBox = $('#thb'); if(thbBox){ thbBox.value = sum>0? sum.toFixed(2) : thbBox.value; }
  return rows;
}

// Wire buttons
window.addEventListener('DOMContentLoaded', ()=>{
  $('#add-line')?.addEventListener('click', ()=>addLine());
  $('#clear-lines')?.addEventListener('click', clearLines);
});

})();