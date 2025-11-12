
// OCR logic using Tesseract.js with MRZ and Thai ID heuristics
// Note: This uses CDN for Tesseract worker & language data (eng, tha).
// It runs fully in-browser; no server needed.

const state = {
  files: [],
  results: [],
  parsed: {}
};

const els = {
  list: null, raw: null, status: null,
  fName: null, lName: null, gender: null, nationality: null,
  idno: null, passport: null, dob: null, doe: null, doi: null,
  address: null
};

function qs(s,root=document){return root.querySelector(s)}

function humanDateFromYYMMDD(yymmdd){
  // Supports MRZ YYMMDD -> YYYY-MM-DD (naive 1930-2029 window)
  if(!/^\d{6}$/.test(yymmdd)) return '';
  let yy = parseInt(yymmdd.slice(0,2),10);
  const mm = yymmdd.slice(2,4);
  const dd = yymmdd.slice(4,6);
  const year = (yy <= 29 ? 2000+yy : 1900+yy);
  return `${year}-${mm}-${dd}`;
}

// Simple MRZ (TD3) parser for passports
function parseMRZ(text){
  const lines = text.split(/\n|\r/).map(s=>s.replace(/\s+/g,'').toUpperCase()).filter(Boolean);
  let mrz = [];
  for(const s of lines){
    if(s.length===44) mrz.push(s);
    if(mrz.length===2) break;
  }
  if(mrz.length<2) return null;
  const L1 = mrz[0], L2 = mrz[1];
  // L1: P<COUNTRYLASTNAME<<FIRSTNAME<MIDDLE
  const docType = L1.slice(0,1);
  const issuing = L1.slice(2,5);
  const namePart = L1.slice(5).replace(/<+/g,'<');
  const [last, first] = namePart.split('<<');
  const lastName = (last||'').replace(/</g,' ').trim();
  const firstName = (first||'').replace(/</g,' ').trim();

  const passportNo = L2.slice(0,9).replace(/</g,'');
  const nationality = L2.slice(10,13).replace(/</g,'');
  const dob = humanDateFromYYMMDD(L2.slice(13,19));
  const sexCode = L2.slice(20,21);
  const doe = humanDateFromYYMMDD(L2.slice(21,27));

  return {
    type: docType, issuing, lastName, firstName,
    passportNo, nationality, dob, sex: sexCode==='F'?'Female':sexCode==='M'?'Male':'Unspecified',
    doe
  };
}

// Heuristic Thai ID parser: find 13-digit ID, name (TH/EN), DOB pattern dd/mm/yyyy
function parseThaiID(text){
  const out = {};
  const digits = text.replace(/[^0-9]/g,'');
  const id13 = digits.match(/\b\d{13}\b/);
  if(id13) out.idno = id13[0];

  // Try DOB dd/mm/yyyy or dd-mm-yyyy
  const dob = text.match(/\b(\d{2})[\/\-](\d{2})[\/\-](\d{4})\b/);
  if(dob){
    out.dob = `${dob[3]}-${dob[2]}-${dob[1]}`;
  }
  // Names: pick first lines with many Thai letters or Latin words
  const lines = text.split(/\n|\r/).map(s=>s.trim()).filter(Boolean);
  const thaiLine = lines.find(s=>/[\u0E00-\u0E7F]{2,}/.test(s));
  if(thaiLine) out.name_th = thaiLine;

  const nameEN = lines.find(s=>/(Name|Surname|Mr\.?|Mrs\.?|Miss|Given|Last)/i.test(s)) 
              || lines.find(s=>/^[A-Z][a-z]+\s+[A-Z][a-z]+/.test(s));
  if(nameEN){
    const m = nameEN.match(/([A-Z][a-z]+)\s+([A-Z][a-z]+)/);
    if(m){ out.first_name = m[1]; out.last_name = m[2]; }
  }
  return Object.keys(out).length ? out : null;
}

async function runOCR(){
  const status = els.status;
  if(state.files.length===0){ status.innerHTML = '<span class="warn">กรุณาเลือกรูปก่อน</span>'; return; }
  status.textContent = 'กำลังประมวลผล OCR...';

  const { createWorker } = Tesseract;
  const worker = await createWorker({
    logger: m => { status.textContent = m.status + (m.progress!=null?` ${(m.progress*100).toFixed(0)}%`:'' ); }
  });

  try{
    await worker.loadLanguage('eng+tha');
    await worker.initialize('eng+tha');

    state.results = [];
    for (const file of state.files){
      const img = URL.createObjectURL(file);
      const { data } = await worker.recognize(img, { rotateAuto: true });
      state.results.push({ file: file.name, text: data.text });
    }
  }catch(e){
    status.innerHTML = '<span class="error">เกิดข้อผิดพลาดในการ OCR: '+ e.message +'</span>';
    return;
  }finally{
    await worker.terminate();
  }

  // Combine and show
  const allText = state.results.map(r=>`[${r.file}]\n${r.text.trim()}`).join('\n\n');
  els.raw.textContent = allText || '(no text)';
  status.innerHTML = '<span class="success">เสร็จแล้ว ✓</span>';

  // Try parse MRZ first (passports). If multiple images, attempt each.
  let parsed = null;
  for(const r of state.results){
    parsed = parseMRZ(r.text);
    if(parsed) break;
  }
  // If not MRZ, attempt Thai ID
  if(!parsed){
    for(const r of state.results){
      const p = parseThaiID(r.text);
      if(p){ parsed = p; break; }
    }
  }
  state.parsed = parsed || {};

  // Fill fields
  if(state.parsed){
    els.fName.value = state.parsed.firstName || state.parsed.first_name || '';
    els.lName.value = state.parsed.lastName || state.parsed.last_name || '';
    els.gender.value = state.parsed.sex || '';
    els.nationality.value = state.parsed.nationality || '';
    els.idno.value = state.parsed.idno || '';
    els.passport.value = state.parsed.passportNo || '';
    els.dob.value = state.parsed.dob || '';
    els.doe.value = state.parsed.doe || '';
  }
  // Keep address blank for manual input
}

function onFiles(files){
  state.files = Array.from(files);
  els.list.innerHTML = '';
  state.files.forEach(f=>{
    const li = document.createElement('div');
    li.className = 'badge';
    li.textContent = f.name + ` (${Math.round(f.size/1024)} KB)`;
    els.list.appendChild(li);
  });
}

function exportCSV(){
  const headers = ['first_name','last_name','gender','nationality','id_number','passport_number','dob','issue_date','expiry_date','address'];
  const row = [
    els.fName.value, els.lName.value, els.gender.value, els.nationality.value,
    els.idno.value, els.passport.value, els.dob.value, els.doi.value, els.doe.value, 
    els.address.value
  ];
  const csv = [headers.join(','), row.map(v => `"${(v||'').replace(/"/g,'""')}"`).join(',')].join('\n');
  const blob = new Blob([csv], {type: 'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'customer_ocr.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function clearAll(){
  state.files = [];
  els.list.innerHTML = '';
  els.raw.textContent = '';
  for(const el of [els.fName,els.lName,els.gender,els.nationality,els.idno,els.passport,els.dob,els.doi,els.doe,els.address]){
    el.value = '';
  }
  els.status.textContent = 'พร้อมใช้งาน';
}

function pushToLocalStorage(){
  const data = {
    first_name: els.fName.value, last_name: els.lName.value, gender: els.gender.value,
    nationality: els.nationality.value, id_number: els.idno.value, passport_number: els.passport.value,
    dob: els.dob.value, issue_date: els.doi.value, expiry_date: els.doe.value, address: els.address.value,
    ts: new Date().toISOString()
  };
  const key = 'ttx_customers';
  const list = JSON.parse(localStorage.getItem(key) || '[]');
  list.push(data);
  localStorage.setItem(key, JSON.stringify(list));
  els.status.innerHTML = '<span class="success">บันทึกแล้วในเครื่อง ✓</span> <span class="small">(เมนูรายงานสามารถดึงได้)</span>';
}

function wire(){
  els.list = qs('#fileList');
  els.raw = qs('#raw');
  els.status = qs('#status');

  els.fName = qs('#first_name');
  els.lName = qs('#last_name');
  els.gender = qs('#gender');
  els.nationality = qs('#nationality');
  els.idno = qs('#id_number');
  els.passport = qs('#passport_number');
  els.dob = qs('#dob');
  els.doi = qs('#doi');
  els.doe = qs('#doe');
  els.address = qs('#address');

  // Drag-and-drop
  const drop = qs('#dropzone');
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.style.borderColor = '#9bd5ff'; });
  drop.addEventListener('dragleave', e => { drop.style.borderColor = ''; });
  drop.addEventListener('drop', e => {
    e.preventDefault();
    drop.style.borderColor = '';
    onFiles(e.dataTransfer.files);
  });
  qs('#file').addEventListener('change', e => onFiles(e.target.files));
  qs('#btn_ocr').addEventListener('click', runOCR);
  qs('#btn_clear').addEventListener('click', clearAll);
  qs('#btn_save').addEventListener('click', pushToLocalStorage);
  qs('#btn_export').addEventListener('click', exportCSV);
}

document.addEventListener('DOMContentLoaded', wire);
