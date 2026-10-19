'use strict';
(()=>{
const $=id=>document.getElementById(id),M=SGFP_REV07,C=SGFP_REV05;
let db=null,handle=null,baseline=null,dirty=false,password='',busy=false;
const enc=new TextEncoder(),types=[{description:'SGFP criptografado',accept:{'application/octet-stream':['.sgfpe']}}];
const msg=x=>$('status').textContent=x;
const money=x=>(x/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
// Digitacao em centavos: 1 → 0,01; 1234 → 12,34; valores persistidos como centavos inteiros.
const brFormat=n=>(n/100).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const brMoney=x=>{const s=String(x||'').replace(/\s/g,'');if(!/^\d{1,3}(?:\.\d{3})*,\d{2}$|^\d+,\d{2}$/.test(s))throw Error('Valor monetário inválido');const n=Number(s.replace(/\./g,'').replace(',','.'));if(!Number.isFinite(n)||n<=0)throw Error('Informe valor superior a R$ 0,00');return n;};
for(const input of document.querySelectorAll('[data-brl]')){input.value='0,00';input.addEventListener('input',()=>{const digits=input.value.replace(/\D/g,'').slice(0,13);input.value=brFormat(Number(digits||0));});input.addEventListener('focus',()=>input.select());}
$('refreshApp').addEventListener('click',()=>{if(dirty&&!confirm('Existem alterações NÃO SALVAS. Atualizar descartará essas alterações. Deseja continuar?'))return;const url=new URL(window.location.href);url.searchParams.set('atualizacao',Date.now().toString());window.location.replace(url.href);});

const sha=async a=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',a))).map(n=>n.toString(16).padStart(2,'0')).join('');
const bytes=x=>enc.encode(JSON.stringify(x,null,2));
function pass(){const p=$('password').value;if(p.length<12)throw Error('Senha de teste com pelo menos 12 caracteres');return p;}
async function read(h){const f=await h.getFile();if(f.size>15000000)throw Error('Arquivo maior que 15MB');const raw=new Uint8Array(await f.arrayBuffer());return {raw,hash:await sha(raw),sealed:JSON.parse(new TextDecoder().decode(raw))};}
function drop(){if(dirty&&!confirm('Descartar alterações não salvas?'))return false;return true;}
function options(id,list,label,empty){const s=$(id);s.replaceChildren();if(empty){const o=document.createElement('option');o.value='';o.textContent='(sem categoria mãe)';s.append(o);}for(const v of list){const o=document.createElement('option');o.value=v.id;o.textContent=label(v);s.append(o);}}
function show(){const enabled=!!db;$('save').disabled=!enabled||!dirty||busy;$('create').disabled=busy;$('open').disabled=busy;$('database').textContent=enabled?handle.name+' | Revisão '+db.revisao+(dirty?' | Alterações NÃO salvas':' | Salvo'):'Nenhuma base aberta.';if(!enabled){$('summary').textContent='Abra uma base de teste.';$('rows').replaceChildren();return;}
options('account',db.dados.contas,v=>v.nome);options('raccount',db.dados.contas,v=>v.nome);options('category',db.dados.categorias,v=>v.nome);options('pcategory',db.dados.categorias,v=>v.nome);options('rcategory',db.dados.categorias,v=>v.nome);options('parentCategory',db.dados.categorias,v=>v.nome,true);options('pcard',db.dados.cartoes,v=>v.nome);
const month=$('month').value,rows=[];for(const l of db.dados.lancamentos.filter(x=>x.data.startsWith(month)))rows.push([l.data,l.descricao,l.tipo,l.valorCentavos,l.id]);
for(const r of M.recurringMonth(db.dados,month))rows.push([r.data,r.descricao,'recorrente prevista',r.valorCentavos,null]);
for(const c of db.dados.cartoes){const inv=M.invoice(db.dados,c.id,month);for(const p of inv.parcelas)rows.push([p.mes,p.descricao+' ('+p.numero+')','parcela '+c.nome,p.valorCentavos,null]);}
$('rows').replaceChildren();for(const row of rows){const tr=document.createElement('tr');for(const v of row.slice(0,4)){const td=document.createElement('td');td.textContent=typeof v==='number'?money(v):String(v);tr.append(td)}const actions=document.createElement('td');if(row[4]){for(const [title,mode] of [['Editar','edit'],['Excluir','delete']]){const b=document.createElement('button');b.type='button';b.textContent=title;b.className='secondary';b.onclick=()=>modifyEntry(row[4],mode);actions.append(b);}}else actions.textContent='—';tr.append(actions);$('rows').append(tr);}
const cards=db.dados.cartoes.map(c=>{const inv=M.invoice(db.dados,c.id,month);return c.nome+': '+money(inv.totalCentavos)+' (vencimento dia '+c.vencimento+')';});$('invoiceSummary').textContent='Faturas previstas por cartão no mês: '+cards.join(' | ')+'. Compras com cartão adicional ainda dependem de detalhamento; faturas e pagamentos efetivos não estão implementados.';
$('registrySummary').textContent='Contas: '+db.dados.contas.map(x=>x.nome).join(' | ')+' · Categorias: '+db.dados.categorias.map(x=>x.nome).join(' | ');
const totals=rows.reduce((acc,r)=>{if(r[2]==='receita')acc.receita+=r[3];else acc.despesa+=r[3];return acc;},{receita:0,despesa:0});
$('summary').textContent='Mês '+month+' | Receitas demonstrativas: '+money(totals.receita)+' | Despesas/compromissos: '+money(totals.despesa)+' | Saldo projetado simplificado: '+money(totals.receita-totals.despesa)+'. Valores de faturas são projeções; pagamento e conciliação ainda não implementados.';
}
async function attach(h,p){const old=await read(h);const obj=await C.decrypt(old.sealed,p);if(obj?.formato!=='SGFP-REV08-CRIPTO'||!Number.isInteger(obj.revisao)||obj.revisao<0||!obj.dados)throw Error('Não é uma base REV08 válida');M.validate(obj.dados);db=obj;handle=h;baseline=old.hash;password=p;dirty=false;show();msg('Base criptografada aberta com sucesso.');}
$('create').onclick=async()=>{try{if(!drop())return;const p=pass();const h=await showSaveFilePicker({suggestedName:'Base_Ficticia_REV08.sgfpe',types});const obj={formato:'SGFP-REV08-CRIPTO',revisao:0,dados:M.seed()};const sealed=await C.encrypt(obj,p);const w=await h.createWritable();await w.write(bytes(sealed));await w.close();await attach(h,p);msg('Base nova criada e conferida. Salve apenas dados fictícios.');}catch(e){msg(e.name==='AbortError'?'Criação cancelada.':'Erro: '+e.message)}};
$('open').onclick=async()=>{try{if(!drop())return;const p=pass();const [h]=await showOpenFilePicker({types});await attach(h,p);}catch(e){msg(e.name==='AbortError'?'Seleção cancelada.':'Falha ao abrir: '+e.message)}};
function change(f){if(!db||busy)return;try{f(db.dados);dirty=true;show();msg('Alterações pendentes: salve com backup obrigatório.');}catch(e){msg('Erro: '+e.message)}}
function modifyEntry(id,mode){if(!db||busy)return;const entry=db.dados.lancamentos.find(x=>x.id===id);if(!entry)return; if(mode==='delete'){if(!confirm('Excluir o lançamento fictício "'+entry.descricao+'"? Esta operação só será definitiva após salvar a base com backup.'))return;change(d=>{d.lancamentos=d.lancamentos.filter(x=>x.id!==id)});return;}
const description=prompt('Descrição do lançamento:',entry.descricao);if(description===null)return;const clean=description.trim();if(!clean||clean.length>120){msg('Descrição inválida');return;}
const value=prompt('Novo valor em reais, usando vírgula nos centavos:',brFormat(entry.valorCentavos));if(value===null)return;let amount;try{amount=brMoney(value)}catch(e){msg('Valor inválido: '+e.message);return;}const date=prompt('Data no formato AAAA-MM-DD:',entry.data);if(date===null)return;if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(date)){msg('Data inválida');return;}
change(d=>{const x=d.lancamentos.find(y=>y.id===id);if(!x)throw Error('Lançamento não localizado');x.descricao=clean;x.data=date;x.valorCentavos=Math.round(amount*100)});}

$('entry').onsubmit=e=>{e.preventDefault();change(d=>M.addEntry(d,{data:$('date').value,descricao:$('description').value,valor:brMoney($('value').value),tipo:$('nature').value,categoriaId:$('category').value,contaId:$('account').value}));};
$('installment').onsubmit=e=>{e.preventDefault();change(d=>M.installment(d,{data:$('pdate').value,descricao:$('pdescription').value,total:brMoney($('pvalue').value),parcelas:Number($('pcount').value),cartaoId:$('pcard').value,categoriaId:$('pcategory').value}));};
$('recurring').onsubmit=e=>{e.preventDefault();change(d=>M.recurring(d,{descricao:$('rdescription').value,valor:brMoney($('rvalue').value),dia:Number($('rday').value),tipo:$('rnature').value,categoriaId:$('rcategory').value,contaId:$('raccount').value,inicio:$('month').value+'-01'}));};
$('newAccount').onsubmit=e=>{e.preventDefault();change(d=>{const n=$('accountName').value.trim();if(!n)throw Error('Nome vazio');d.contas.push({id:crypto.randomUUID(),nome:n,tipo:'corrente',saldoInicialCentavos:0});});};
$('newCategory').onsubmit=e=>{e.preventDefault();change(d=>{const n=$('categoryName').value.trim();if(!n)throw Error('Nome vazio');d.categorias.push({id:crypto.randomUUID(),nome:n,pai:$('parentCategory').value||null});});};
$('month').onchange=show;
for(const b of document.querySelectorAll('[data-panel]'))b.onclick=()=>{for(const key of ['lancamentos','parcelas','recorrencias','cadastros'])$('panel-'+key).hidden=key!==b.dataset.panel;};
$('save').onclick=async()=>{if(!db||!dirty||!handle||busy)return;busy=true;show();try{const original=await read(handle);if(original.hash!==baseline)throw Error('BLOQUEADO: arquivo foi alterado externamente');const rev=await C.decrypt(original.sealed,password);if(rev.formato!==db.formato||rev.revisao!==db.revisao||rev.dados.baseId!==db.dados.baseId)throw Error('BLOQUEADO: revisão ou identidade divergente');
msg('Selecione a pasta 05_Backups no diálogo de backup obrigatório. Cancelar preserva o arquivo principal.');
const bh=await showSaveFilePicker({suggestedName:'SGFP_REV08_BACKUP_r'+db.revisao+'_'+new Date().toISOString().replace(/[:.]/g,'-')+'.sgfpe',types});
if(await bh.isSameEntry(handle))throw Error('Backup não pode sobrescrever a base principal');
const bw=await bh.createWritable();await bw.write(original.raw);await bw.close();if((await read(bh)).hash!==original.hash)throw Error('Backup não corresponde ao original');
if((await read(handle)).hash!==baseline)throw Error('BLOQUEADO: arquivo mudou durante o backup');
const next={...db,revisao:db.revisao+1};const encrypted=await C.encrypt(next,password);const output=bytes(encrypted),writer=await handle.createWritable();await writer.write(output);await writer.close();
const verified=await read(handle);if(verified.hash!==await sha(output))throw Error('Verificação do arquivo falhou');const recovered=await C.decrypt(verified.sealed,password);if(recovered.revisao!==next.revisao||recovered.dados.baseId!==next.dados.baseId)throw Error('Falha na recuperação');
db=next;baseline=verified.hash;dirty=false;msg('SALVO E VERIFICADO. Backup criptografado anterior confirmado localmente. Aguarde sincronização de AMBOS os arquivos.');}
catch(e){msg(e.name==='AbortError'?'SALVAMENTO CANCELADO: base original preservada.':'NÃO CONCLUÍDO: '+e.message+'; preserve esta aba.')}finally{busy=false;show();}};
const today=new Date().toISOString().slice(0,10);$('date').value=today;$('pdate').value=today;show();
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue=''}});
})();