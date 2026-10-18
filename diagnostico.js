'use strict';
// Diagnóstico REV04: opera exclusivamente em memória. Nenhum arquivo do usuário é aberto/escrito.
(()=>{
const $=id=>document.getElementById(id);
const enc=new TextEncoder();
const sha=async x=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(JSON.stringify(x))))).map(b=>b.toString(16).padStart(2,'0')).join('');
let report=null;
const item=(id,value)=>({id,data:'2026-10-18',descricao:'Teste fictício',tipo:'Despesa',valor:value});
const base=()=>({formato:'SGFP-POC-REV02',versao:1,baseId:'diagnostico-rev04-somente-memoria',revisao:1,atualizadoEm:'2026-10-18T00:00:00Z',lancamentos:[item('ficticio-1',34.2)]});
function check(x){return x&&x.formato==='SGFP-POC-REV02'&&x.versao===1&&Array.isArray(x.lancamentos)&&x.lancamentos.every(i=>typeof i.id==='string'&&i.valor>0);}
async function run(){
const tests=[];const test=(name,passed,details)=>tests.push({name,passed:!!passed,details});
const source=base();
const serial=JSON.stringify(source);const restored=JSON.parse(serial);
test('Serialização e recuperação de JSON',check(restored)&&restored.lancamentos[0].valor===34.2,'Cópia em memória; nenhum arquivo aberto');
const before=await sha(source);const modified=structuredClone(source);modified.revisao=2;
test('Identificação de alteração externa',before!==await sha(modified),'Comparação de hashes calculados em memória');
const candidate=structuredClone(source);candidate.lancamentos.push(item('ficticio-2',15));
const simulatedCancel=true;const diskCopy=structuredClone(source);
test('Cancelamento simulado de backup',simulatedCancel&&diskCopy.revisao===1&&diskCopy.lancamentos.length===1,'Não invoca o seletor do Chrome e NÃO testa o cancelamento real');
const snapshot=structuredClone(source);const backup=JSON.parse(JSON.stringify(snapshot));
test('Cópia pré-gravação preservada',await sha(snapshot)===await sha(backup)&&backup.revisao===1,'Sem gravação física');
const next=structuredClone(candidate);next.revisao=source.revisao+1;
test('Progressão de revisão',next.revisao===2&&next.lancamentos.length===2,'Cálculo fictício em memória');
test('API local disponível',typeof window.showOpenFilePicker==='function'&&typeof window.showSaveFilePicker==='function','Disponibilidade da API apenas; não testa permissões corporativas');
report={versao:'REV04',executadoEm:new Date().toISOString(),ambiente:'diagnostico-exclusivamente-em-memoria',tests,aprovados:tests.filter(t=>t.passed).length,total:tests.length,alerta:'Não valida sincronização, integridade do OneDrive, arquivo real, cancelamento do seletor ou gravações simultâneas.'};
$('diagresults').textContent=tests.map(t=>(t.passed?'APROVADO':'NÃO CONFIRMADO')+' — '+t.name+'\n  '+t.details).join('\n')+'\n\n'+report.aprovados+'/'+report.total+' verificações.\n'+report.alerta;
$('exportdiag').disabled=false;
}
$('diagnose').addEventListener('click',()=>run().catch(e=>{$('diagresults').textContent='Falha no diagnóstico: '+e.message;}));
$('exportdiag').addEventListener('click',()=>{if(!report)return;const u=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=u;a.download='Diagnostico_Local_REV04.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),10000);});
})();
