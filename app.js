let usuarioAtual = null;
let todosLeads = [];
let leadAtual = null;

async function fazerLogin() {
  const email = document.getElementById('login-email').value;
  const senha = document.getElementById('login-senha').value;
  const erro = document.getElementById('login-erro');
  erro.textContent = '';
  try {
    const { data, error } = await db.auth.signInWithPassword({ email, password: senha });
    if (error) { erro.textContent = 'E-mail ou senha incorretos.'; return; }
    const { data: perfil } = await db.from('perfis').select('*').eq('id', data.user.id).single();
    usuarioAtual = { ...data.user, ...perfil };
    iniciarApp();
  } catch(e) { erro.textContent = 'Erro ao conectar. Tente novamente.'; }
}

async function iniciarApp() {
  document.getElementById('tela-login').classList.add('hidden');
  document.getElementById('tela-app').classList.remove('hidden');
  document.getElementById('user-nome').textContent = usuarioAtual.nome || usuarioAtual.email;
  document.getElementById('user-papel').textContent = usuarioAtual.papel === 'gestor' ? 'Gestor' : 'Atendente';
  document.getElementById('user-iniciais').textContent = iniciais(usuarioAtual.nome || usuarioAtual.email);
  const hoje = new Date().toLocaleDateString('pt-BR', { weekday:'long', day:'2-digit', month:'long' });
  document.getElementById('data-hoje').textContent = hoje;
  await carregarDashboard();
  await carregarLeads();
  await carregarFollowUps();
  await carregarKanban();
}

function iniciais(nome) {
  return nome.split(' ').slice(0,2).map(n => n[0]).join('').toUpperCase();
}

function mostrarSecao(id) {
  document.querySelectorAll('.secao').forEach(s => s.classList.add('hidden'));
  document.querySelectorAll('.nav-link').forEach(n => n.classList.remove('active'));
  document.getElementById('sec-' + id).classList.remove('hidden');
  const link = document.querySelector(`.nav-link[onclick*="${id}"]`);
  if (link) link.classList.add('active');
  if (id === 'kanban') carregarKanban();
  if (id === 'leads') carregarLeads();
  if (id === 'followup') carregarFollowUps();
  if (id === 'dashboard') carregarDashboard();
}
 
function mostrarSecaoDir(id) {
  document.querySelectorAll('.secao').forEach(s => s.classList.add('hidden'));
  document.getElementById('sec-' + id).classList.remove('hidden');
}

async function sair() {
  await db.auth.signOut();
  location.reload();
}

async function carregarDashboard() {
  const { data: leads } = await db.from('leads').select('*');
  if (!leads) return;
  const ativos = leads.filter(l => !['desqualificado','enviado_operacional'].includes(l.status));
  const contratos = leads.filter(l => l.status === 'contrato_assinado');
  const hoje = new Date().toDateString();
  const novos = leads.filter(l => new Date(l.criado_em).toDateString() === hoje);
  document.getElementById('met-ativos').textContent = ativos.length;
  document.getElementById('met-contratos').textContent = contratos.length;
  document.getElementById('met-novos').textContent = novos.length;
  const { data: fups } = await db.from('follow_ups').select('*').in('status',['pendente','atrasado']);
  const pendentes = fups ? fups.filter(f => new Date(f.data_prevista) <= new Date()) : [];
  document.getElementById('met-followups').textContent = fups ? fups.length : 0;
  const badge = document.getElementById('badge-followup');
  if (pendentes.length > 0) { badge.textContent = pendentes.length; badge.classList.remove('hidden'); }
  const recentes = leads.sort((a,b) => new Date(b.criado_em) - new Date(a.criado_em)).slice(0,5);
  document.getElementById('lista-recentes').innerHTML = recentes.map(l => `
    <div class="lead-item" onclick="abrirLead('${l.id}')">
      <div class="lead-av">${iniciais(l.nome)}</div>
      <div class="lead-info">
        <div class="lead-nome">${l.nome}</div>
        <div class="lead-sub">${labelServico(l.servico)}</div>
      </div>
      ${badgeStatus(l.status)}
    </div>`).join('');
  if (fups) {
    const urgentes = fups.sort((a,b) => new Date(a.data_prevista) - new Date(b.data_prevista)).slice(0,5);
    document.getElementById('lista-urgentes').innerHTML = urgentes.length ? urgentes.map(f => {
      const atrasado = new Date(f.data_prevista) < new Date();
      const dot = atrasado ? 'urgente' : 'ok';
      const tempo = atrasado ? '<span style="color:#e74c3c">Atrasado</span>' : formatarData(f.data_prevista);
      return `<div class="followup-list-item">
        <div class="fu-dot ${dot}"></div>
        <div class="fu-info">
          <div class="fu-nome">Follow up ${f.prazo_dias} dias</div>
          <div class="fu-desc">${f.tipo === 'gestacional' ? 'Gestacional' : 'Padrão'}</div>
        </div>
        <div class="fu-tempo">${tempo}</div>
      </div>`;
    }).join('') : '<div style="padding:16px;color:#888;font-size:12px">Nenhum follow up pendente</div>';
  }
}

async function carregarLeads() {
  const { data } = await db.from('leads').select('*, perfis(nome)').order('criado_em', { ascending: false });
  todosLeads = data || [];
  renderizarLeads(todosLeads);
}

function renderizarLeads(leads) {
  if (!leads.length) {
    document.getElementById('tabela-leads').innerHTML = '<div style="padding:20px;text-align:center;color:#888">Nenhum lead encontrado</div>';
    return;
  }
  document.getElementById('tabela-leads').innerHTML = `
    <table>
      <thead><tr>
        <th>Cliente</th><th>Serviço</th><th>Status</th><th>Atendente</th><th>Criado em</th>
      </tr></thead>
      <tbody>${leads.map(l => `
        <tr style="cursor:pointer" onclick="abrirLead('${l.id}')">
          <td><strong>${l.nome}</strong><br><span style="color:#888">${l.telefone}</span></td>
          <td>${badgeServico(l.servico)}</td>
          <td>${badgeStatus(l.status)}</td>
          <td>${l.perfis?.nome || '—'}</td>
          <td>${formatarData(l.criado_em)}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}

function filtrarLeads() {
  const busca = document.getElementById('filtro-busca').value.toLowerCase();
  const servico = document.getElementById('filtro-servico').value;
  const status = document.getElementById('filtro-status').value;
  const filtrados = todosLeads.filter(l => {
    const okBusca = !busca || l.nome.toLowerCase().includes(busca) || l.telefone.includes(busca);
    const okServico = !servico || l.servico === servico;
    const okStatus = !status || l.status === status;
    return okBusca && okServico && okStatus;
  });
  renderizarLeads(filtrados);
}

async function carregarFollowUps() {
  const { data } = await db.from('follow_ups').select('*, leads(nome, servico)').in('status',['pendente','atrasado']).order('data_prevista');
  const lista = document.getElementById('lista-followups');
  if (!data || !data.length) {
    lista.innerHTML = '<div style="padding:20px;text-align:center;color:#888;background:#fff;border-radius:10px">Nenhum follow up pendente</div>';
    return;
  }
  lista.innerHTML = `<div class="panel">${data.map(f => {
    const atrasado = new Date(f.data_prevista) < new Date();
    const dot = atrasado ? 'urgente' : 'ok';
    const tempo = atrasado ? '<span style="color:#e74c3c;font-weight:500">Atrasado</span>' : formatarData(f.data_prevista);
    return `<div class="followup-list-item" style="${atrasado ? 'background:#fff5f5' : ''}">
      <div class="fu-dot ${dot}"></div>
      <div class="fu-info">
        <div class="fu-nome">${f.leads?.nome || '—'} · ${labelServico(f.leads?.servico)}</div>
        <div class="fu-desc">Follow up ${f.prazo_dias} dias · ${f.tipo === 'gestacional' ? 'Gestacional' : 'Padrão'}</div>
      </div>
      <div class="fu-tempo">${tempo}</div>
    </div>`;
  }).join('')}</div>`;
}

async function abrirLead(id) {
  const { data: lead } = await db.from('leads').select('*, perfis(nome)').eq('id', id).single();
  const { data: fups } = await db.from('follow_ups').select('*').eq('lead_id', id).order('data_prevista');
  const { data: obs } = await db.from('mensagens').select('*').eq('lead_id', id).order('enviado_em');
  leadAtual = lead;

  const secao = document.getElementById('sec-detalhe');
  secao.innerHTML = `
    <div class="page-header">
      <div style="display:flex;align-items:center;gap:12px">
        <button class="btn-secondary" onclick="mostrarSecaoDir('leads')">← Voltar</button>
        <h2>${lead.nome}</h2>
        ${badgeStatus(lead.status)}
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn-secondary" onclick="abrirWhatsApp('${lead.telefone}')">💬 WhatsApp</button>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
      <div class="panel">
        <div class="panel-header">Dados do lead</div>
        <div style="padding:16px;display:flex;flex-direction:column;gap:10px">
          <div><span style="font-size:11px;color:#888">Telefone</span><div style="font-size:13px;font-weight:500">${lead.telefone}</div></div>
          <div><span style="font-size:11px;color:#888">Serviço</span><div>${badgeServico(lead.servico)}</div></div>
          <div><span style="font-size:11px;color:#888">Atendente</span><div style="font-size:13px">${lead.perfis?.nome || '—'}</div></div>
          <div><span style="font-size:11px;color:#888">Criado em</span><div style="font-size:13px">${formatarData(lead.criado_em)}</div></div>
          ${lead.data_gestacao ? `<div><span style="font-size:11px;color:#888">Previsão do parto</span><div style="font-size:13px">${new Date(lead.data_gestacao).toLocaleDateString('pt-BR')}</div></div>` : ''}
        </div>
      </div>

      <div class="panel">
        <div class="panel-header">Alterar status</div>
        <div style="padding:16px;display:flex;flex-direction:column;gap:8px">
          ${['novo','em_qualificacao','qualificado','em_andamento','aguardando_documento','contrato_assinado','enviado_operacional','desqualificado'].map(s => `
            <button onclick="alterarStatus('${lead.id}','${s}')" class="btn-status ${lead.status === s ? 'ativo' : ''}" style="text-align:left;padding:7px 12px;border-radius:8px;border:1px solid ${lead.status === s ? '#534AB7' : '#eee'};background:${lead.status === s ? '#EEEDFE' : '#fff'};color:${lead.status === s ? '#534AB7' : '#555'};cursor:pointer;font-size:12px">
              ${lead.status === s ? '● ' : '○ '} ${labelStatus(s)}
            </button>`).join('')}
        </div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <div class="panel">
        <div class="panel-header">Follow ups</div>
        <div>${fups && fups.length ? fups.map(f => {
          const atrasado = new Date(f.data_prevista) < new Date() && f.status === 'pendente';
          const realizado = f.status === 'realizado';
          return `<div class="followup-list-item" style="${atrasado ? 'background:#fff5f5' : realizado ? 'background:#f0fff4' : ''}">
            <div class="fu-dot ${atrasado ? 'urgente' : realizado ? 'ok' : 'hoje'}"></div>
            <div class="fu-info">
              <div class="fu-nome">${f.prazo_dias} dias · ${f.tipo === 'gestacional' ? 'Gestacional' : 'Padrão'}</div>
              <div class="fu-desc">${formatarData(f.data_prevista)}</div>
            </div>
            <div style="display:flex;gap:6px;align-items:center">
              <span style="font-size:10px;color:${atrasado ? '#e74c3c' : realizado ? '#27ae60' : '#888'}">${atrasado ? 'Atrasado' : realizado ? 'Realizado' : 'Pendente'}</span>
              ${!realizado ? `<button onclick="marcarFollowUp('${f.id}','${lead.id}')" style="font-size:10px;padding:3px 8px;border-radius:6px;border:1px solid #27ae60;background:#fff;color:#27ae60;cursor:pointer">✓ Feito</button>` : ''}
            </div>
          </div>`;
        }).join('') : '<div style="padding:16px;color:#888;font-size:12px">Nenhum follow up</div>'}</div>
      </div>

      <div class="panel">
        <div class="panel-header">Observações</div>
        <div style="padding:16px">
          <textarea id="obs-texto" rows="4" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:12px;resize:vertical" placeholder="Digite uma observação...">${lead.observacoes || ''}</textarea>
          <button onclick="salvarObservacao('${lead.id}')" class="btn-primary small" style="margin-top:8px">Salvar observação</button>
          <p id="obs-msg" style="font-size:11px;margin-top:6px;color:#27ae60"></p>
          <div style="margin-top:12px;border-top:1px solid #eee;padding-top:12px">
            <div style="font-size:11px;color:#888;margin-bottom:8px">Histórico</div>
            ${obs && obs.length ? obs.map(o => `
              <div style="margin-bottom:8px;padding:8px;background:#f9f9f9;border-radius:6px">
                <div style="font-size:12px">${o.conteudo}</div>
                <div style="font-size:10px;color:#aaa;margin-top:4px">${formatarData(o.enviado_em)}</div>
              </div>`).join('') : '<div style="font-size:12px;color:#aaa">Nenhum registro ainda</div>'}
          </div>
        </div>
      </div>
    </div>`;

  mostrarSecaoDir('detalhe');
}

async function alterarStatus(leadId, novoStatus) {
  await db.from('leads').update({ status: novoStatus }).eq('id', leadId);
  await abrirLead(leadId);
  await carregarDashboard();
}

async function marcarFollowUp(fupId, leadId) {
  await db.from('follow_ups').update({ status: 'realizado', data_realizado: new Date().toISOString() }).eq('id', fupId);
  await abrirLead(leadId);
  await carregarFollowUps();
}

async function salvarObservacao(leadId) {
  const texto = document.getElementById('obs-texto').value.trim();
  if (!texto) return;
  await db.from('mensagens').insert({ lead_id: leadId, direção: 'enviada', conteudo: texto });
  await db.from('leads').update({ observacoes: texto }).eq('id', leadId);
  document.getElementById('obs-msg').textContent = 'Salvo!';
  setTimeout(() => abrirLead(leadId), 800);
}

function abrirWhatsApp(telefone) {
  const num = telefone.replace(/\D/g,'');
  window.open(`https://wa.me/55${num}`, '_blank');
}

async function salvarLead() {
  const nome = document.getElementById('nl-nome').value.trim();
  const telefone = document.getElementById('nl-telefone').value.trim();
  const servico = document.getElementById('nl-servico').value;
  const obs = document.getElementById('nl-obs').value.trim();
  const gestacao = document.getElementById('nl-gestacao').value;
  const msg = document.getElementById('nl-msg');
  if (!nome || !telefone || !servico) { msg.textContent = 'Preencha os campos obrigatórios.'; msg.className = 'mensagem erro'; return; }
  try {
    const { data: lead, error } = await db.from('leads').insert({
      nome, telefone, servico, observacoes: obs,
      data_gestacao: gestacao || null,
      atendente_id: usuarioAtual.id,
      status: 'novo'
    }).select().single();
    if (error) throw error;
    await criarFollowUps(lead.id, servico, gestacao);
    msg.textContent = 'Lead salvo com sucesso!';
    msg.className = 'mensagem ok';
    document.getElementById('nl-nome').value = '';
    document.getElementById('nl-telefone').value = '';
    document.getElementById('nl-servico').value = '';
    document.getElementById('nl-obs').value = '';
    await carregarLeads();
    await carregarDashboard();
    setTimeout(() => mostrarSecaoDir('leads'), 1500);
  } catch(e) { msg.textContent = 'Erro ao salvar. Tente novamente.'; msg.className = 'mensagem erro'; }
}

async function criarFollowUps(leadId, servico, gestacao) {
  const agora = new Date();
  let prazos = [];
  if (servico === 'salario_maternidade') {
    prazos = [7, 30, 60, 90, 150].map(dias => ({
      lead_id: leadId, tipo: 'gestacional', prazo_dias: dias,
      data_prevista: new Date(agora.getTime() + dias * 86400000).toISOString(),
      status: 'pendente'
    }));
  } else {
    prazos = [1, 3, 7, 15, 30].map(dias => ({
      lead_id: leadId, tipo: 'padrao', prazo_dias: dias,
      data_prevista: new Date(agora.getTime() + dias * 86400000).toISOString(),
      status: 'pendente'
    }));
  }
  await db.from('follow_ups').insert(prazos);
}

function verificarGestacao() {
  const servico = document.getElementById('nl-servico').value;
  const grupo = document.getElementById('grupo-gestacao');
  grupo.style.display = servico === 'salario_maternidade' ? 'block' : 'none';
}

function labelServico(s) {
  const map = { salario_maternidade:'Sal. Maternidade', auxilio_doenca:'Aux. Doença', bpc_loas:'BPC/LOAS', auxilio_acidente:'Aux. Acidente' };
  return map[s] || s;
}

function labelStatus(s) {
  const map = { novo:'Novo', em_qualificacao:'Em qualificação', qualificado:'Qualificado', em_andamento:'Em andamento', aguardando_documento:'Aguardando documento', contrato_assinado:'Contrato assinado', enviado_operacional:'Enviado ao operacional', desqualificado:'Desqualificado' };
  return map[s] || s;
}

function badgeServico(s) {
  const map = { salario_maternidade:['sv-mat','Sal. Maternidade'], auxilio_doenca:['sv-doe','Aux. Doença'], bpc_loas:['sv-bpc','BPC/LOAS'], auxilio_acidente:['sv-aci','Aux. Acidente'] };
  const [cls, label] = map[s] || ['','--'];
  return `<span class="serv-badge ${cls}">${label}</span>`;
}

function badgeStatus(s) {
  const map = { novo:['s-novo','Novo'], em_qualificacao:['s-qualificacao','Em qualificação'], qualificado:['s-qualificado','Qualificado'], em_andamento:['s-andamento','Em andamento'], aguardando_documento:['s-aguardando','Aguard. documento'], contrato_assinado:['s-contrato','Contrato assinado'], enviado_operacional:['s-operacional','Enviado op.'], desqualificado:['s-desqualificado','Desqualificado'] };
  const [cls, label] = map[s] || ['','--'];
  return `<span class="status-badge ${cls}">${label}</span>`;
}

function formatarData(d) {
  return new Date(d).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
}

db.auth.onAuthStateChange((event, session) => {
  if (session && !usuarioAtual) {
    db.from('perfis').select('*').eq('id', session.user.id).single().then(({ data }) => {
      if (data) { usuarioAtual = { ...session.user, ...data }; iniciarApp(); }
    });
  }
});
const KANBAN_COLUNAS = [
  { id: 'novo', label: 'Novo', cor: '#185FA5', bg: '#E6F1FB' },
  { id: 'em_qualificacao', label: 'Em qualificação', cor: '#633806', bg: '#FAEEDA' },
  { id: 'qualificado', label: 'Qualificado', cor: '#27500A', bg: '#EAF3DE' },
  { id: 'em_andamento', label: 'Em andamento', cor: '#3C3489', bg: '#EEEDFE' },
  { id: 'aguardando_documento', label: 'Aguard. documento', cor: '#633806', bg: '#FAEEDA' },
  { id: 'contrato_assinado', label: 'Contrato assinado', cor: '#085041', bg: '#E1F5EE' },
  { id: 'enviado_operacional', label: 'Enviado op.', cor: '#085041', bg: '#EAF3DE' },
  { id: 'desqualificado', label: 'Desqualificado', cor: '#A32D2D', bg: '#FCEBEB' }
];

async function carregarKanban() {
  const { data: leads } = await db.from('leads').select('*, perfis(nome)').order('criado_em', { ascending: false });
  const board = document.getElementById('kanban-board');
  if (!board) return;
  board.innerHTML = '';
  KANBAN_COLUNAS.forEach(col => {
    const cards = (leads || []).filter(l => l.status === col.id);
    const colEl = document.createElement('div');
    colEl.className = 'kanban-col';
    colEl.dataset.status = col.id;
    colEl.innerHTML = `
      <div class="kanban-col-header" style="background:${col.bg};color:${col.cor}">
        <span>${col.label}</span>
        <span class="kanban-count">${cards.length}</span>
      </div>
      <div class="kanban-col-body" id="col-${col.id}"></div>`;
    board.appendChild(colEl);
    const body = colEl.querySelector('.kanban-col-body');
    cards.forEach(lead => {
      const card = document.createElement('div');
      card.className = 'kanban-card';
      card.draggable = true;
      card.dataset.id = lead.id;
      card.innerHTML = `
        <div class="kanban-card-nome">${lead.nome}</div>
        <div class="kanban-card-sub">${labelServico(lead.servico)}</div>
        <div class="kanban-card-sub" style="margin-top:4px">${lead.perfis?.nome || '—'}</div>`;
      card.addEventListener('click', () => abrirLead(lead.id));
      card.addEventListener('dragstart', e => {
        e.dataTransfer.setData('leadId', lead.id);
        card.classList.add('dragging');
      });
      card.addEventListener('dragend', () => card.classList.remove('dragging'));
      body.appendChild(card);
    });
    body.addEventListener('dragover', e => { e.preventDefault(); body.classList.add('drag-over'); });
    body.addEventListener('dragleave', () => body.classList.remove('drag-over'));
    body.addEventListener('drop', async e => {
      e.preventDefault();
      body.classList.remove('drag-over');
      const leadId = e.dataTransfer.getData('leadId');
      await db.from('leads').update({ status: col.id }).eq('id', leadId);
      await carregarKanban();
      await carregarDashboard();
    });
  });
}
