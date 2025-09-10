const URL_JSON = 'https://raw.githubusercontent.com/bibliotecacidrosado/acervofisico/refs/heads/main/dados.json';

let livrosAcervo = [];
let dadosCompletos = [];
let generosDisponiveis = [];

let colunaOrdenacaoAtual = '';
let ordemAscendente = true;

function mostrarMensagem(texto, tipo) {
  const mensagemDiv = document.getElementById('mensagem');
  mensagemDiv.innerHTML = `<div class="${tipo}">${texto}</div>`;
  if (tipo !== 'error') {
    setTimeout(() => { mensagemDiv.innerHTML = ''; }, 3000);
  }
}

function atualizarResumo(dados) {
  const totalLivros = dados.livros?.length || 0;
  const totalDisponiveis = dados.livros?.filter(l => l.status === 'Disponível').length || 0;
  document.getElementById('total-livros').textContent = totalLivros;
  document.getElementById('total-disponiveis').textContent = totalDisponiveis;
}

function formatarStatus(livro) {
  if (!livro.disponiveis || livro.disponiveis === 0) return livro.status;
  const pluralExemplar = livro.disponiveis > 1 ? 'Exemplares' : 'Exemplar';
  const pluralStatus = livro.disponiveis > 1 ? 's' : '';
  return `${livro.disponiveis} ${pluralExemplar} ${livro.status}${pluralStatus}`;
}

function atualizarLista(dados) {
  const lista = document.getElementById('listaLivros');
  atualizarResumo(dados);
  lista.innerHTML = '';
  if (!dados.livros || dados.livros.length === 0) {
    lista.innerHTML = '<div class="loading">Nenhum livro encontrado</div>';
    return;
  }
  dados.livros.forEach(l => {
    const div = document.createElement('div');
    div.className = 'livro';
    if (window.innerWidth <= 768) {
      div.innerHTML = `
        <span data-label="Título: ">${l.titulo || 'Não informado'}</span>
        <span data-label="Autor: ">${l.autor || 'Não informado'}</span>
        <span data-label="Gênero: ">${l.genero || 'Não informado'}</span>
        <span data-label="Localização: ">${l.localizacao || 'Não informado'}</span>
        <span data-label="Status: " class="status ${l.status === 'Disponível' ? 'disponivel' : 'indisponivel'}">
          ${formatarStatus(l)}
        </span>`;
    } else {
      div.innerHTML = `
        <span>${l.titulo || 'Não informado'}</span>
        <span>${l.autor || 'Não informado'}</span>
        <span>${l.genero || 'Não informado'}</span>
        <span>${l.localizacao || 'Não informado'}</span>
        <span class="status ${l.status === 'Disponível' ? 'disponivel' : 'indisponivel'}">
          ${formatarStatus(l)}
        </span>`;
    }
    lista.appendChild(div);
  });
}

function extrairGeneros() {
  const generosSet = new Set();
  dadosCompletos.forEach(livro => {
    if (livro.genero && livro.genero.trim() !== '') generosSet.add(livro.genero);
  });
  generosDisponiveis = Array.from(generosSet).sort();
  const filtroGenero = document.getElementById('filtroGenero');
  while (filtroGenero.options.length > 1) filtroGenero.remove(1);
  generosDisponiveis.forEach(genero => {
    const option = document.createElement('option');
    option.value = genero; option.textContent = genero;
    filtroGenero.appendChild(option);
  });
}

function filtrarLivros(){
  const termo = document.getElementById('busca').value.toLowerCase();
  const statusFiltro = document.getElementById('filtroStatus').value;
  const generoFiltro = document.getElementById('filtroGenero').value;
  
  const listaFiltrada = dadosCompletos.filter(l => {
    const correspondeTermo = 
      (l.titulo && l.titulo.toLowerCase().includes(termo)) ||
      (l.autor && l.autor.toLowerCase().includes(termo)) ||
      (l.genero && l.genero.toLowerCase().includes(termo)) ||
      (l.localizacao && l.localizacao.toLowerCase().includes(termo));
    const correspondeStatus = statusFiltro === 'todos' || l.status === statusFiltro;
    const correspondeGenero = generoFiltro === 'todos' || l.genero === generoFiltro;
    return correspondeTermo && correspondeStatus && correspondeGenero;
  });

  atualizarLista({ livros: listaFiltrada });
}

function ordenarLista() {
  if (!colunaOrdenacaoAtual) return;
  const listaOrdenada = [...dadosCompletos].sort((a, b) => {
    let valA = (a[colunaOrdenacaoAtual] || '').toString().toLowerCase();
    let valB = (b[colunaOrdenacaoAtual] || '').toString().toLowerCase();
    if (valA < valB) return ordemAscendente ? -1 : 1;
    if (valA > valB) return ordemAscendente ? 1 : -1;
    return 0;
  });
  atualizarLista({ livros: listaOrdenada });
}

function ordenarColuna(coluna) {
  if (colunaOrdenacaoAtual === coluna) ordemAscendente = !ordemAscendente;
  else { colunaOrdenacaoAtual = coluna; ordemAscendente = true; }
  ordenarLista();
}

async function carregarDados() {
  try {
    mostrarMensagem('Carregando dados do acervo...', 'loading');
    const response = await fetch(URL_JSON);
    if (!response.ok) throw new Error(`Erro HTTP: ${response.status}`);
    const dados = await response.json();
    if (!dados.livros || !Array.isArray(dados.livros)) throw new Error('Formato inválido do arquivo JSON.');

    dadosCompletos = dados.livros;
    livrosAcervo = [...dadosCompletos];

    extrairGeneros();
    atualizarLista(dados);
    mostrarMensagem('Dados carregados com sucesso!', 'success');
  } catch (error) {
    console.error('Erro ao carregar dados:', error);
    mostrarMensagem(`Erro ao carregar dados: ${error.message}`, 'error');
    document.getElementById('listaLivros').innerHTML = '<div class="error">Erro ao carregar o acervo. Verifique o console para detalhes.</div>';
  }
}

// Inicialização quando o documento estiver pronto
document.addEventListener('DOMContentLoaded', function() {
  // Configurar event listeners
  document.getElementById('busca').addEventListener('input', filtrarLivros);
  document.getElementById('filtroStatus').addEventListener('change', filtrarLivros);
  document.getElementById('filtroGenero').addEventListener('change', filtrarLivros);
  
  // Adicionar event listeners para ordenação
  const cabecalhos = document.querySelectorAll('.cabecalho span');
  cabecalhos.forEach(cabecalho => {
    cabecalho.addEventListener('click', () => {
      ordenarColuna(cabecalho.getAttribute('data-coluna'));
    });
  });
  
  // Carregar os dados
  carregarDados();
});
