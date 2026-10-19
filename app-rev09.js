'use strict';
(()=>{
const $=id=>document.getElementById(id),M=SGFP_REV07;
let db=null,handle=null,baseline=null,dirty=false,busy=false;
const enc=new TextEncoder(),types=[{description:'Base SGFP JSON',accept:{'application/json':['.json']}}];
const msg=x=>$('status').textContent=x;
const money=x=>(x/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
// Digitacao em centavos: 1 → 0,01; 1234 → 12,34; valores persistidos como centavos inteiros.
const brFormat=n=>(n/100).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const brMoney=x=>{const s=String(x||'').replace(/\s/g,'');if(!/^\d{1,3}(?:\.\d{3})*,\d{2}$|^\d+,\d{2}$/.test(s))throw Error('Valor monetário inválido');const n=Number(s.replace(/\./g,'').replace(',','.'));if(!Number.isFinite(n)||n<=0)throw Error('Informe valor superior a R$ 0,00');return n;};
for(const input of document.querySelectorAll('[data-brl]')){input.value='0,00';input.addEventListener('input',()=>{const digits=input.value.replace(/\D/g,'').slice(0,13);input.value=brFormat(Number(digits||0));});input.addEventListener('focus',()=>input.select());}
$('refreshApp').addEventListener('click',()=>{if(dirty&&!confirm('Existem alterações NÃO SALVAS. Atualizar descartará essas alterações. Deseja continuar?'))return;const url=new URL(window.location.href);url.searchParams.set('atualizacao',Date.now().toString());window.location.replace(url.href);});

const sha=async a=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',a))).map(n=>n.toString(16).padStart(2,'0')).join('');
const bytes=x=>enc.encode(JSON.stringify(x,null,2));
async function read(h){const f=await h.getFile();if(f.size>15000000)throw Error('Arquivo maior que 15MB');const raw=new Uint8Array(await f.arrayBuffer());return {raw,hash:await sha(raw),object:JSON.parse(new TextDecoder().decode(raw))};}
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
async function attach(h){const old=await read(h);const obj=old.object;if(obj?.formato!=='SGFP-REV09-JSON'||!Number.isInteger(obj.revisao)||obj.revisao<0||!obj.dados)throw Error('Este arquivo não é uma base REV09. Arquivos .sgfpe anteriores NÃO são compatíveis.');M.validate(obj.dados);db=obj;handle=h;baseline=old.hash;dirty=false;show();msg('Base JSON REV09 aberta com sucesso.');}
$('create').onclick=async()=>{if(!drop())return;let stage='seleção do arquivo';try{msg('Abrindo janela de criação. Selecione 04_Testes e confirme Salvar.');const h=await showSaveFilePicker({suggestedName:'Base_Ficticia_REV09.json',types});stage='gravação no OneDrive';msg('Arquivo escolhido: '+h.name+'. Gravando base fictícia...');const obj={formato:'SGFP-REV09-JSON',revisao:0,dados:M.seed()};const w=await h.createWritable();await w.write(bytes(obj));await w.close();stage='verificação da base';msg('Gravação concluída. Conferindo conteúdo...');await attach(h);msg('BASE REV09 CRIADA E VERIFICADA: '+h.name+' | Revisão 0. Aguarde a sincronização pelo OneDrive.');}catch(e){const message=e?.name==='AbortError'?'Operação cancelada na janela do Windows.':e?.name+': '+e?.message;msg('FALHA na etapa '+stage+': '+message);}};
$('open').onclick=async()=>{try{if(!drop())return;const [h]=await showOpenFilePicker({types});await attach(h);}catch(e){msg(e.name==='AbortError'?'Seleção cancelada.':'Falha ao abrir: '+e.message)}};
function change(f){if(!db||busy)return;try{f(db.dados);dirty=true;show();msg('Alterações pendentes: salve com backup obrigatório.');}catch(e){msg('Erro: '+e.message)}}
let editingId=null;
function endEdit(){editingId=null;$('editSection').hidden=true;}
function modifyEntry(id,mode){if(!db||busy)return;const entry=db.dados.lancamentos.find(x=>x.id===id);if(!entry)return;if(mode==='delete'){if(editingId===id)endEdit();if(!confirm('Excluir o lançamento fictício "'+entry.descricao+'"? A exclusão só será definitiva após salvar com backup.'))return;change(d=>{d.lancamentos=d.lancamentos.filter(x=>x.id!==id)});return;}
editingId=id;$('editFeedback').textContent='Edite os campos e clique em Aplicar edição.';
options('editAccount',db.dados.contas,v=>v.nome);
options('editCategory',db.dados.categorias,v=>v.nome);
$('editDate').value=entry.data;$('editDescription').value=entry.descricao;$('editValue').value=brFormat(entry.valorCentavos);$('editNature').value=entry.tipo;$('editCategory').value=entry.categoriaId;$('editAccount').value=entry.contaId;
$('editSection').hidden=false;$('editSection').scrollIntoView({behavior:'smooth',block:'center'});$('editDescription').focus();
}
$('cancelEdit').onclick=endEdit;
$('editForm').onsubmit=e=>{e.preventDefault();if(!db||!editingId)return;const id=editingId;const fields={data:$('editDate').value,descricao:$('editDescription').value.trim(),tipo:$('editNature').value,categoriaId:$('editCategory').value,contaId:$('editAccount').value};let centavos;try{const n=brMoney($('editValue').value);centavos=Math.round(n*100);if(!/^\d{4}-\d{2}-\d{2}$/.test(fields.data)||Number.isNaN(Date.parse(fields.data+'T12:00:00Z')))throw Error('Data inválida');if(!fields.descricao||fields.descricao.length>120||!['receita','despesa'].includes(fields.tipo)||!db.dados.categorias.some(x=>x.id===fields.categoriaId)||!db.dados.contas.some(x=>x.id===fields.contaId))throw Error('Confira os campos do lançamento');}catch(err){$('editFeedback').textContent='EDIÇÃO BLOQUEADA: '+err.message;msg('Edição não realizada: '+err.message);return;}
change(d=>{const item=d.lancamentos.find(x=>x.id===id);if(!item)throw Error('Lançamento não encontrado');Object.assign(item,fields,{valorCentavos:centavos});});const updated=db.dados.lancamentos.find(x=>x.id===id);if(updated&&updated.valorCentavos===centavos&&updated.descricao===fields.descricao){endEdit();msg('EDIÇÃO APLICADA: '+updated.descricao+' — '+money(updated.valorCentavos)+'. Ainda não salvo no OneDrive.');}else{$('editFeedback').textContent='ERRO: edição não confirmada. Não salve ainda.';}
};

$('entry').onsubmit=e=>{e.preventDefault();change(d=>M.addEntry(d,{data:$('date').value,descricao:$('description').value,valor:brMoney($('value').value),tipo:$('nature').value,categoriaId:$('category').value,contaId:$('account').value}));};
$('installment').onsubmit=e=>{e.preventDefault();change(d=>M.installment(d,{data:$('pdate').value,descricao:$('pdescription').value,total:brMoney($('pvalue').value),parcelas:Number($('pcount').value),cartaoId:$('pcard').value,categoriaId:$('pcategory').value}));};
$('recurring').onsubmit=e=>{e.preventDefault();change(d=>M.recurring(d,{descricao:$('rdescription').value,valor:brMoney($('rvalue').value),dia:Number($('rday').value),tipo:$('rnature').value,categoriaId:$('rcategory').value,contaId:$('raccount').value,inicio:$('month').value+'-01'}));};
$('newAccount').onsubmit=e=>{e.preventDefault();change(d=>{const n=$('accountName').value.trim();if(!n)throw Error('Nome vazio');d.contas.push({id:crypto.randomUUID(),nome:n,tipo:'corrente',saldoInicialCentavos:0});});};
$('newCategory').onsubmit=e=>{e.preventDefault();change(d=>{const n=$('categoryName').value.trim();if(!n)throw Error('Nome vazio');d.categorias.push({id:crypto.randomUUID(),nome:n,pai:$('parentCategory').value||null});});};
$('month').onchange=show;
for(const b of document.querySelectorAll('[data-panel]'))b.onclick=()=>{for(const key of ['lancamentos','parcelas','recorrencias','cadastros'])$('panel-'+key).hidden=key!==b.dataset.panel;};
$('save').onclick=async()=>{if(!db||!dirty||!handle||busy)return;busy=true;show();try{const original=await read(handle);if(original.hash!==baseline)throw Error('BLOQUEADO: arquivo foi alterado externamente');const rev=original.object;if(rev.formato!==db.formato||rev.revisao!==db.revisao||rev.dados.baseId!==db.dados.baseId)throw Error('BLOQUEADO: revisão ou identidade divergente');
msg('Selecione a pasta 05_Backups. O backup é obrigatório e não será criptografado.');
const bh=await showSaveFilePicker({suggestedName:'SGFP_REV09_BACKUP_r'+db.revisao+'_'+new Date().toISOString().replace(/[:.]/g,'-')+'.json',types});
if(await bh.isSameEntry(handle))throw Error('Backup não pode sobrescrever a base principal');
const bw=await bh.createWritable();await bw.write(original.raw);await bw.close();if((await read(bh)).hash!==original.hash)throw Error('Backup não corresponde ao original');
if((await read(handle)).hash!==baseline)throw Error('BLOQUEADO: arquivo mudou durante o backup');
const next={...db,revisao:db.revisao+1};const output=bytes(next),writer=await handle.createWritable();await writer.write(output);await writer.close();
const verified=await read(handle);if(verified.hash!==await sha(output))throw Error('Verificação do arquivo falhou');if(verified.object.revisao!==next.revisao||verified.object.dados.baseId!==next.dados.baseId)throw Error('Falha de recuperação');
db=next;baseline=verified.hash;dirty=false;msg('SALVO E VERIFICADO. Backup anterior confirmado localmente. Aguarde o OneDrive sincronizar os DOIS arquivos.');}
catch(e){msg(e.name==='AbortError'?'SALVAMENTO CANCELADO: arquivo principal preservado.':'NÃO CONCLUÍDO: '+e.message+'; preserve esta aba.')}finally{busy=false;show();}};
const today=new Date().toISOString().slice(0,10);$('date').value=today;$('pdate').value=today;show();
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue=''}});
})();