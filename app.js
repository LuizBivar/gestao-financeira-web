'use strict';
// REV03 - experimental: backups confirmados antes da gravação. Dados fictícios somente.
const $=id=>document.getElementById(id);
const FORMAT='SGFP-POC-REV02'; // Compatibilidade com as bases dos testes anteriores
let doc=null,handle=null,baseline=null,dirty=false,busy=false;
const status=s=>{$('status').textContent=s;};
const fmt=v=>Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const fileApi=typeof window.showOpenFilePicker==='function'&&typeof window.showSaveFilePicker==='function';
const newBase=()=>({formato:FORMAT,versao:1,baseId:crypto.randomUUID(),revisao:0,atualizadoEm:new Date().toISOString(),lancamentos:[]});
const validEntry=x=>x&&typeof x.id==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x.data)&&typeof x.descricao==='string'&&x.descricao.length<=150&&['Receita','Despesa'].includes(x.tipo)&&Number.isFinite(x.valor)&&x.valor>0;
const validate=x=>x&&x.formato===FORMAT&&x.versao===1&&typeof x.baseId==='string'&&Number.isSafeInteger(x.revisao)&&x.revisao>=0&&Array.isArray(x.lancamentos)&&x.lancamentos.length<=20000&&x.lancamentos.every(validEntry)&&new Set(x.lancamentos.map(y=>y.id)).size===x.lancamentos.length;
const hash=async ab=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',ab))).map(x=>x.toString(16).padStart(2,'0')).join('');
const bytes=obj=>new TextEncoder().encode(JSON.stringify(obj,null,2));
const dateTag=()=>new Date().toISOString().replace(/[:.]/g,'-');
function download(content,name){const u=URL.createObjectURL(new Blob([content],{type:'application/json'}));const a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),10000);}
function render(){const ok=!!doc;$('add').disabled=!ok||busy;$('save').disabled=!ok||!dirty||busy||!handle;$('backup').disabled=!ok||busy;$('open').disabled=busy;$('new').disabled=busy;$('fallback').disabled=busy;$('rows').replaceChildren();if(!ok){$('fileName').textContent='Nenhuma base aberta.';return;}for(const e of doc.lancamentos){const tr=document.createElement('tr');for(const v of [e.data,e.descricao,e.tipo,fmt(e.valor)]){const td=document.createElement('td');td.textContent=v;tr.append(td);} $('rows').append(tr);} $('fileName').textContent=`Arquivo: ${handle?.name||'(cópia importada sem vínculo de gravação)'} | ID: ${doc.baseId.slice(0,8)} | Revisão interna: ${doc.revisao} | ${dirty?'ALTERAÇÕES NÃO SALVAS':'Sem alterações pendentes'}`;}
async function readHandle(h){const f=await h.getFile();if(f.size>10000000)throw Error('Arquivo excede 10 MB');const ab=await f.arrayBuffer();const x=JSON.parse(new TextDecoder().decode(ab));if(!validate(x))throw Error('Formato incompatível ou arquivo inválido');return {x,checksum:await hash(ab),raw:new Uint8Array(ab)};}
function hasUnsaved(){return dirty&&!confirm('Existem alterações não salvas. Deseja descartá-las?');}
async function attach(h){if(hasUnsaved())return;const r=await readHandle(h);handle=h;doc=r.x;baseline=r.checksum;dirty=false;render();status('Base aberta. Não edite o mesmo arquivo em outro computador.');}
$('open').onclick=async()=>{try{if(!fileApi)throw Error('Abertura direta indisponível neste navegador. Use o diagnóstico.');const [h]=await window.showOpenFilePicker({types:[{description:'Base JSON',accept:{'application/json':['.json']}}]});await attach(h);}catch(e){status(e.name==='AbortError'?'Seleção cancelada.':'Falha ao abrir: '+e.message);}};
$('fallback').onclick=()=>{const inp=document.createElement('input');inp.type='file';inp.accept='.json,application/json';inp.onchange=async()=>{try{const f=inp.files?.[0];if(!f)return;if(f.size>10000000)throw Error('Arquivo excede 10 MB');const x=JSON.parse(await f.text());if(!validate(x))throw Error('Formato inválido');if(hasUnsaved())return;doc=x;handle=null;baseline=null;dirty=false;render();status('LEITURA CONFIRMADA: cópia aberta, sem permissão de gravação sobre o original.');}catch(e){status('Falha ao importar: '+e.message);}};inp.click();};
$('new').onclick=async()=>{try{if(hasUnsaved())return;const x=newBase();if(fileApi){const h=await window.showSaveFilePicker({suggestedName:'Base_Financeira_Teste_REV03.json',types:[{description:'Arquivo JSON',accept:{'application/json':['.json']}}]});const w=await h.createWritable();await w.write(bytes(x));await w.close();await attach(h);status('Base de teste criada. Confirme a sincronização do OneDrive.');}else{doc=x;handle=null;baseline=null;dirty=false;render();download(bytes(x),'Base_Financeira_Teste_REV03.json');status('Cópia baixada. A gravação direta requer Chrome ou Edge no computador.');}}catch(e){if(e.name!=='AbortError')status('Falha ao criar: '+e.message);}};
$('entry').onsubmit=e=>{e.preventDefault();if(!doc||busy)return;const x={id:crypto.randomUUID(),data:$('dt').value,valor:Number($('vl').value),descricao:$('desc').value.trim(),tipo:$('tipo').value};if(!validEntry(x))return status('Dados inválidos.');doc.lancamentos.push(x);dirty=true;render();status('Lançamento pendente. Ao salvar, selecione PRIMEIRO onde guardar o backup obrigatório.');e.target.reset();$('dt').value=new Date().toISOString().slice(0,10);};
async function confirmedBackup(snapshot,original){const name=`SGFP_REV03_PRE_SAVE_r${snapshot.x.revisao}_${dateTag()}.json`;const b=await window.showSaveFilePicker({suggestedName:name,types:[{description:'Cópia JSON',accept:{'application/json':['.json']}}]});if(typeof b.isSameEntry==='function'&&await b.isSameEntry(original))throw Error('Backup não pode sobrescrever o arquivo principal.');const w=await b.createWritable();await w.write(snapshot.raw);await w.close();const verify=await readHandle(b);if(verify.checksum!==snapshot.checksum)throw Error('Falha na verificação do backup.');return b.name;}
$('save').onclick=async()=>{if(!doc||!dirty||!handle||busy)return;busy=true;render();try{const before=await readHandle(handle);if(before.checksum!==baseline||before.x.baseId!==doc.baseId){status('BLOQUEADO: arquivo foi alterado externamente. Faça backup do estado pendente e reabra a base.');return;}
status('Selecione a pasta 05_Backups no diálogo para gravar o BACKUP OBRIGATÓRIO da versão anterior. Se cancelar, nada será sobrescrito.');
const backupName=await confirmedBackup(before,handle);
const doubleCheck=await readHandle(handle);
if(doubleCheck.checksum!==baseline){status('BLOQUEADO: alteração externa detectada depois do backup. Arquivo principal não foi gravado.');return;}
const next={...doc,revisao:doc.revisao+1,atualizadoEm:new Date().toISOString()};
const w=await handle.createWritable();await w.write(bytes(next));await w.close();
const verified=await readHandle(handle);
if(verified.x.baseId!==next.baseId||verified.x.revisao!==next.revisao||verified.checksum!==await hash(bytes(next)))throw Error('O arquivo gravado não corresponde ao esperado.');
doc=next;baseline=verified.checksum;dirty=false;status('SALVO E VERIFICADO. Backup anterior: '+backupName+'. Confirme a sincronização de AMBOS os arquivos no OneDrive.');}
catch(e){status(e.name==='AbortError'?'SALVAMENTO CANCELADO: o backup não foi confirmado e o arquivo principal não foi alterado.':'NÃO CONCLUÍDO: '+e.message+'. Preserve esta aba e exporte o estado pendente se necessário.');}
finally{busy=false;render();}};
$('backup').onclick=()=>{if(!doc)return;download(bytes(doc),`SGFP_REV03_Exportacao_${dateTag()}.json`);status('Exportação solicitada. Confirme o arquivo em Downloads; não substitui um backup sincronizado.');};
$('dt').value=new Date().toISOString().slice(0,10);
status(fileApi?'Acesso direto disponível. Use apenas arquivos de teste.':'Sem acesso direto a arquivos neste navegador; não use para operações reais.');
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
