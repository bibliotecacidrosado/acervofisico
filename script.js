// Configurações
const URL_JSON = 'https://raw.githubusercontent.com/bibliotecacidrosado/acervofisico/refs/heads/main/dados.json';
const CACHE_KEY = 'biblioteca_acervo_cache';
const CACHE_TIMESTAMP_KEY = 'biblioteca_acervo_timestamp';
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutos em milissegundos

// Esquema de validação para os livros
const LIVRO_ESQUEMA = {
    titulo: { tipo: 'string', obrigatorio: false },
    autor: { tipo: 'string', obrigatorio: false },
    genero: { tipo: 'string', obrigatorio: false },
    localizacao: { tipo: 'string', obrigatorio: false },
    status: { tipo: 'string', obrigatorio: true, valoresValidos: ['Disponível', 'Indisponível'] },
    disponiveis: { tipo: 'number', obrigatorio: false, min: 0 },
    dataAdicao: { tipo: 'string', obrigatorio: false }
};

// Configurações de paginação
const PAGINACAO_CONFIG = {
    itensPorPagina: 20,
    paginaAtual: 1,
    totalPaginas: 1,
    maxPaginasVisiveis: 5
};

// Variáveis globais
let livrosAcervo = [];
let dadosCompletos = [];
let livrosFiltrados = [];
let livrosOrdenados = [];
let generosDisponiveis = [];
let colunaOrdenacaoAtual = '';
let ordemAscendente = true;
let timeoutBusca = null;

// Elementos DOM
let buscaInput, filtroStatus, filtroGenero, ordenacaoSelect, listaLivros, mensagemDiv, paginacaoContainer;

document.addEventListener('DOMContentLoaded', function() {
    buscaInput = document.getElementById('busca');
    filtroStatus = document.getElementById('filtroStatus');
    filtroGenero = document.getElementById('filtroGenero');
    ordenacaoSelect = document.getElementById('ordenacao');
    listaLivros = document.getElementById('listaLivros');
    mensagemDiv = document.getElementById('mensagem');
    paginacaoContainer = document.getElementById('paginacao');

    if (!buscaInput || !filtroStatus || !filtroGenero || !ordenacaoSelect || !listaLivros || !mensagemDiv) {
        console.error("Erro: Elementos do DOM não encontrados.");
        return;
    }

    buscaInput.addEventListener('input', debounceFiltrarLivros);
    filtroStatus.addEventListener('change', filtrarLivros);
    filtroGenero.addEventListener('change', filtrarLivros);
    ordenacaoSelect.addEventListener('change', function() {
        ordenarLivros(this.value);
        PAGINACAO_CONFIG.paginaAtual = 1;
        renderizarLivros();
        atualizarControlesPaginacao();
    });

    document.getElementById('itensPorPagina')?.addEventListener('change', function() {
        PAGINACAO_CONFIG.itensPorPagina = parseInt(this.value);
        PAGINACAO_CONFIG.paginaAtual = 1;
        calcularTotalPaginas();
        renderizarLivros();
        atualizarControlesPaginacao();
    });

    carregarDados();
});

// ==========================
// Funções de Paginação Otimizadas
// ==========================

function calcularTotalPaginas() {
    PAGINACAO_CONFIG.totalPaginas = Math.max(
        1,
        Math.ceil(livrosFiltrados.length / PAGINACAO_CONFIG.itensPorPagina)
    );
}

function irParaPagina(pagina) {
    if (pagina < 1 || pagina > PAGINACAO_CONFIG.totalPaginas) return;
    PAGINACAO_CONFIG.paginaAtual = pagina;
    renderizarLivros();
    atualizarControlesPaginacao();
}

function atualizarControlesPaginacao() {
    if (!paginacaoContainer) return;

    paginacaoContainer.innerHTML = "";
    const { paginaAtual, totalPaginas, maxPaginasVisiveis } = PAGINACAO_CONFIG;

    const criarBotao = (texto, pagina, desabilitado = false, ativo = false) => {
        const btn = document.createElement('button');
        btn.textContent = texto;
        btn.disabled = desabilitado;
        if (ativo) btn.classList.add('ativo');
        btn.addEventListener('click', () => irParaPagina(pagina));
        return btn;
    };

    paginacaoContainer.appendChild(criarBotao('«', 1, paginaAtual === 1));
    paginacaoContainer.appendChild(criarBotao('‹', paginaAtual - 1, paginaAtual === 1));

    let inicio = Math.max(1, paginaAtual - Math.floor(maxPaginasVisiveis / 2));
    let fim = Math.min(totalPaginas, inicio + maxPaginasVisiveis - 1);

    if (fim - inicio < maxPaginasVisiveis - 1) {
        inicio = Math.max(1, fim - maxPaginasVisiveis + 1);
    }

    for (let i = inicio; i <= fim; i++) {
        paginacaoContainer.appendChild(criarBotao(i, i, false, i === paginaAtual));
    }

    paginacaoContainer.appendChild(criarBotao('›', paginaAtual + 1, paginaAtual === totalPaginas));
    paginacaoContainer.appendChild(criarBotao('»', totalPaginas, paginaAtual === totalPaginas));

    // Campo de salto direto
    const saltoContainer = document.createElement('div');
    saltoContainer.classList.add('salto-pagina');

    const inputSalto = document.createElement('input');
    inputSalto.type = 'number';
    inputSalto.min = 1;
    inputSalto.max = totalPaginas;
    inputSalto.placeholder = `1-${totalPaginas}`;
    inputSalto.value = paginaAtual;
    inputSalto.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const paginaDestino = parseInt(inputSalto.value);
            if (!isNaN(paginaDestino)) {
                irParaPagina(paginaDestino);
            }
        }
    });

    const btnIr = document.createElement('button');
    btnIr.textContent = 'Ir';
    btnIr.addEventListener('click', () => {
        const paginaDestino = parseInt(inputSalto.value);
        if (!isNaN(paginaDestino)) {
            irParaPagina(paginaDestino);
        }
    });

    saltoContainer.appendChild(inputSalto);
    saltoContainer.appendChild(btnIr);
    paginacaoContainer.appendChild(saltoContainer);
}

// ==========================
// Funções de Ordenação e Filtro
// ==========================

function ordenarLivros(criterio) {
    const livrosParaOrdenar = [...livrosFiltrados];
    switch(criterio) {
        case 'recentes':
            livrosParaOrdenar.sort((a, b) => new Date(b.dataAdicao || 0) - new Date(a.dataAdicao || 0));
            break;
        case 'antigos':
            livrosParaOrdenar.sort((a, b) => new Date(a.dataAdicao || 0) - new Date(b.dataAdicao || 0));
            break;
        case 'titulo':
            livrosParaOrdenar.sort((a, b) => (a.titulo || '').localeCompare(b.titulo || ''));
            break;
        case 'autor':
            livrosParaOrdenar.sort((a, b) => (a.autor || '').localeCompare(b.autor || ''));
            break;
    }
    livrosOrdenados = livrosParaOrdenar;
    livrosFiltrados = livrosOrdenados;
}

function ordenarColuna(coluna) {
    if (colunaOrdenacaoAtual === coluna) {
        ordemAscendente = !ordemAscendente;
    } else {
        colunaOrdenacaoAtual = coluna;
        ordemAscendente = true;
    }

    livrosOrdenados = [...dadosCompletos].sort((a, b) => {
        let valA = (a[colunaOrdenacaoAtual] || '').toString().toLowerCase();
        let valB = (b[colunaOrdenacaoAtual] || '').toString().toLowerCase();
        if (valA < valB) return ordemAscendente ? -1 : 1;
        if (valA > valB) return ordemAscendente ? 1 : -1;
        return 0;
    });

    livrosFiltrados = livrosOrdenados;
    PAGINACAO_CONFIG.paginaAtual = 1;
    calcularTotalPaginas();
    renderizarLivros();
    atualizarControlesPaginacao();
}

function filtrarLivros() {
    const termo = buscaInput.value.toLowerCase();
    const statusFiltro = filtroStatus.value;
    const generoFiltro = filtroGenero.value;
    const criterioOrdenacao = ordenacaoSelect.value;

    livrosFiltrados = dadosCompletos.filter(l => {
        const correspondeTermo =
            (l.titulo && l.titulo.toLowerCase().includes(termo)) ||
            (l.autor && l.autor.toLowerCase().includes(termo)) ||
            (l.genero && l.genero.toLowerCase().includes(termo)) ||
            (l.localizacao && l.localizacao.toLowerCase().includes(termo));
        const correspondeStatus = statusFiltro === 'todos' || l.status === statusFiltro;
        const correspondeGenero = generoFiltro === 'todos' || l.genero === generoFiltro;
        return correspondeTermo && correspondeStatus && correspondeGenero;
    });

    ordenarLivros(criterioOrdenacao);
    calcularTotalPaginas();
    PAGINACAO_CONFIG.paginaAtual = 1;
    renderizarLivros();
    atualizarControlesPaginacao();
}
