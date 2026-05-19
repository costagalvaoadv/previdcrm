let usuarioAtual = null;
let todosLeads = [];

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
}

function iniciais(nome) {
  return nome.split(' ').slice(0,2).map(n => n[0]).join('').toUpperCase();
}

function mostrarSecao(id) {
  document.querySelectorAll('.secao').forEach(s => s.classList.add('hidden'));
  document.querySelectorAll('.nav-link').forEach(n => n.classList.remove('active'));
  document.getElementById('sec-' + id).classList.remove('hidden');
  event.currentTarget && event.currentTarget.classList.add('active');
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
  const { data: fups } = await db.from('follow_ups').select('*').eq('status','pendente');
  const pendentes = fups ? fups.filter(f => new Date(f.data_prevista) <= new Date()) : [];
  document.getElementById('met-followups').textContent = fups ? fups.length : 0;
  const badge = document.getElementById('badge-followup');
  if (pendentes.length > 0) { badge.textContent = pendentes.length; badge.classList.remove('hidden'); }
  const recentes = leads.sort((a,b) => new Date(b.criado_em) - new Date(a.criado_em)).slice(0,5);
  document.getElementById('lista-recentes').innerHTML = recentes.map(l => `
    <div class="lead-item">
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
  const { data } = await db.from('leads').select('*').order('criado_em', { ascending: false });
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
        <th>Cliente</th><th>Serviço</th><th>Status</th><th>Criado em</th><th>Próx. follow up</th>
      </tr></thead>
      <tbody>${leads.map(l => `
        <tr>
          <td><strong>${l.nome}</strong><br><span style="color:#888">${l.telefone}</span></td>
          <td>${badgeServico(l.servico)}</td>
          <td>${badgeStatus(l.status)}</td>
          <td>${formatarData(l.criado_em)}</td>
          <td>—</td>
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

function mostrarSecaoDir(id) {
  document.querySelectorAll('.secao').forEach(s => s.classList.add('hidden'));
  document.getElementById('sec-' + id).classList.remove('hidden');
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
