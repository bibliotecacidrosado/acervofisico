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
    dataAdicao: { tipo: 'string', obrigatorio: false } // Novo campo para data de adição
};

// Configurações de paginação
const PAGINACAO_CONFIG = {
    itensPorPagina: 20,
    paginaAtual: 1,
    totalPaginas: 1,
    maxPaginasVisiveis: 5 // Número máximo de páginas mostradas na navegação
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

// Elementos DOM (serão inicializados no DOMContentLoaded)
let buscaInput, filtroStatus, filtroGenero, ordenacaoSelect, listaLivros, mensagemDiv;

// Inicialização quando o documento estiver pronto
document.addEventListener('DOMContentLoaded', function() {
    // Configurar referências aos elementos DOM
    buscaInput = document.getElementById('busca');
    filtroStatus = document.getElementById('filtroStatus');
    filtroGenero = document.getElementById('filtroGenero');
    ordenacaoSelect = document.getElementById('ordenacao');
    listaLivros = document.getElementById('listaLivros');
    mensagemDiv = document.getElementById('mensagem');
    
    // Configurar event listeners
    buscaInput.addEventListener('input', debounceFiltrarLivros);
    filtroStatus.addEventListener('change', filtrarLivros);
    filtroGenero.addEventListener('change', filtrarLivros);
    ordenacaoSelect.addEventListener('change', function() {
        ordenarLivros(this.value);
        PAGINACAO_CONFIG.paginaAtual = 1;
        renderizarLivros();
        atualizarControlesPaginacao();
    });
    
    // Event listeners para paginação
    document.getElementById('itensPorPagina').addEventListener('change', function() {
        PAGINACAO_CONFIG.itensPorPagina = parseInt(this.value);
        PAGINACAO_CONFIG.paginaAtual = 1;
        calcularTotalPaginas();
        renderizarLivros();
        atualizarControlesPaginacao();
    });
    
    document.getElementById('primeiraPagina').addEventListener('click', function() {
        irParaPagina(1);
    });
    
    document.getElementById('paginaAnterior').addEventListener('click', function() {
        irParaPagina(PAGINACAO_CONFIG.paginaAtual - 1);
    });
    
    document.getElementById('proximaPagina').addEventListener('click', function() {
        irParaPagina(PAGINACAO_CONFIG.paginaAtual + 1);
    });
    
    document.getElementById('ultimaPagina').addEventListener('click', function() {
        irParaPagina(PAGINACAO_CONFIG.totalPaginas);
    });
    
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

// ========== VALIDAÇÃO DE DADOS ========== //

/**
 * Valida um livro individual contra o esquema definido
 * @param {Object} livro - O livro a ser validado
 * @returns {Object} { valido: boolean, erro: string }
 */
function validarLivro(livro) {
    // Verificar se é um objeto
    if (typeof livro !== 'object' || livro === null) {
        return { valido: false, erro: 'Livro não é um objeto válido' };
    }
    
    const errors = [];
    
    // Validar cada campo conforme o esquema
    for (const [campo, regras] of Object.entries(LIVRO_ESQUEMA)) {
        const valor = livro[campo];
        const valorEstaDefinido = valor !== undefined && valor !== null && valor !== '';
        
        // Verificar campo obrigatório
        if (regras.obrigatorio && !valorEstaDefinido) {
            errors.push(`Campo obrigatório "${campo}" está faltando`);
            continue;
        }
        
        // Se o valor não está definido, pular outras validações
        if (!valorEstaDefinido) continue;
        
        // Validar tipo do campo
        if (regras.tipo === 'number') {
            const valorNumerico = Number(valor);
            if (isNaN(valorNumerico)) {
                errors.push(`Campo "${campo}" deve ser um número`);
            } else if (regras.min !== undefined && valorNumerico < regras.min) {
                errors.push(`Campo "${campo}" deve ser no mínimo ${regras.min}`);
            }
            // Substituir o valor pelo número convertido
            livro[campo] = valorNumerico;
        } else if (typeof valor !== regras.tipo) {
            errors.push(`Campo "${campo}" deve ser do tipo ${regras.tipo}`);
        }
        
        // Validar valores específicos (para campos como status)
        if (regras.valoresValidos && !regras.valoresValidos.includes(valor)) {
            errors.push(`Campo "${campo}" deve ser um dos valores: ${regras.valoresValidos.join(', ')}`);
        }
    }
    
    // Validar campos adicionais não definidos no esquema
    for (const campo in livro) {
        if (!LIVRO_ESQUEMA.hasOwnProperty(campo)) {
            console.warn(`Campo não esperado encontrado no livro: ${campo}`);
            // Você pode optar por remover campos não esperados:
            // delete livro[campo];
        }
    }
    
    return {
        valido: errors.length === 0,
        erro: errors.length > 0 ? errors.join('; ') : null
    };
}

/**
 * Valida a estrutura completa dos dados
 * @param {Object} dados - Os dados brutos do JSON
 * @returns {Object} { valido: boolean, livros: Array, errors: Array }
 */
function validarDados(dados) {
    if (!dados || typeof dados !== 'object') {
        return { 
            valido: false, 
            livros: [], 
            errors: ['Dados inválidos: não é um objeto'] 
        };
    }
    
    if (!dados.livros || !Array.isArray(dados.livros)) {
        return { 
            valido: false, 
            livros: [], 
            errors: ['Estrutura inválida: propriedade "livros" não encontrada ou não é um array'] 
        };
    }
    
    const livrosValidados = [];
    const errors = [];
    let livrosCorrompidos = 0;
    
    // Validar cada livro individualmente
    dados.livros.forEach((livro, index) => {
        const validacao = validarLivro(livro);
        
        if (!validacao.valido) {
            errors.push(`Livro na posição ${index}: ${validacao.erro}`);
            livrosCorrompidos++;
            
            // Tentar recuperar o livro com valores padrão
            const livroRecuperado = tentarRecuperarLivro(livro);
            if (livroRecuperado) {
                livrosValidados.push(livroRecuperado);
            }
        } else {
            livrosValidados.push(livro);
        }
    });
    
    // Log de livros corrompidos para debug
    if (livrosCorrompidos > 0) {
        console.warn(`${livrosCorrompidos} livro(s) com problemas foram encontrados e ${livrosValidados.length - (dados.livros.length - livrosCorrompidos)} recuperados`);
    }
    
    return {
        valido: errors.length === 0,
        livros: livrosValidados,
        errors: errors,
        totalLivros: dados.livros.length,
        livrosCorrompidos: livrosCorrompidos,
        livrosRecuperados: livrosValidados.length - (dados.livros.length - livrosCorrompidos)
    };
}

/**
 * Tenta recuperar um livro com dados incompletos ou inválidos
 * @param {Object} livro - O livro corrompido
 * @returns {Object|null} Livro recuperado ou null se não for possível recuperar
 */
function tentarRecuperarLivro(livro) {
    // Criar uma cópia para não modificar o original
    const recuperado = { ...livro };
    
    // Garantir que campos obrigatórios tenhan valores padrão
    if (!recuperado.status || !LIVRO_ESQUEMA.status.valoresValidos.includes(recuperado.status)) {
        recuperado.status = 'Indisponível'; // Valor padrão conservador
    }
    
    // Garantir que campos numéricos sejam números válidos
    if (recuperado.disponiveis !== undefined) {
        const disponiveisNum = Number(recuperado.disponiveis);
        recuperado.disponiveis = isNaN(disponiveisNum) || disponiveisNum < 0 ? 0 : disponiveisNum;
    }
    
    // Garantir que campos de texto sejam strings
    const camposTexto = ['titulo', 'autor', 'genero', 'localizacao'];
    camposTexto.forEach(campo => {
        if (recuperado[campo] !== undefined && typeof recuperado[campo] !== 'string') {
            recuperado[campo] = String(recuperado[campo]);
        } else if (recuperado[campo] === undefined) {
            recuperado[campo] = 'Não informado';
        }
    });
    
    // Validar o livro recuperado
    const validacao = validarLivro(recuperado);
    return validacao.valido ? recuperado : null;
}

// ========== FUNÇÕES DE PAGINAÇÃO ========== //

/**
 * Calcula o total de páginas com base nos livros filtrados
 */
function calcularTotalPaginas() {
    PAGINACAO_CONFIG.totalPaginas = Math.ceil(livrosFiltrados.length / PAGINACAO_CONFIG.itensPorPagina);
    PAGINACAO_CONFIG.totalPaginas = Math.max(PAGINACAO_CONFIG.totalPaginas, 1); // Mínimo 1 página
}

/**
 * Renderiza os controles de paginação
 */
function atualizarControlesPaginacao() {
    const primeiraPagina = document.getElementById('primeiraPagina');
    const paginaAnterior = document.getElementById('paginaAnterior');
    const proximaPagina = document.getElementById('proximaPagina');
    const ultimaPagina = document.getElementById('ultimaPagina');
    const numerosPaginas = document.getElementById('numerosPaginas');
    const infoRegistros = document.getElementById('infoRegistros');
    const infoPaginacao = document.getElementById('info-paginacao');
    
    // Atualizar estado dos botões
    primeiraPagina.disabled = PAGINACAO_CONFIG.paginaAtual === 1;
    paginaAnterior.disabled = PAGINACAO_CONFIG.paginaAtual === 1;
    proximaPagina.disabled = PAGINACAO_CONFIG.paginaAtual === PAGINACAO_CONFIG.totalPaginas;
    ultimaPagina.disabled = PAGINACAO_CONFIG.paginaAtual === PAGINACAO_CONFIG.totalPaginas;
    
    // Atualizar informação de paginação no resumo
    infoPaginacao.textContent = `${PAGINACAO_CONFIG.paginaAtual}/${PAGINACAO_CONFIG.totalPaginas}`;
    
    // Calcular índices dos livros mostrados
    const inicio = (PAGINACAO_CONFIG.paginaAtual - 1) * PAGINACAO_CONFIG.itensPorPagina + 1;
    const fim = Math.min(PAGINACAO_CONFIG.paginaAtual * PAGINACAO_CONFIG.itensPorPagina, livrosFiltrados.length);
    
    // Atualizar informação de registros
    infoRegistros.textContent = `Mostrando ${inicio}-${fim} de ${livrosFiltrados.length} livros`;
    
    // Gerar números de páginas para navegação
    numerosPaginas.innerHTML = '';
    
    // Calcular range de páginas para mostrar
    let inicioPaginas = Math.max(1, PAGINACAO_CONFIG.paginaAtual - Math.floor(PAGINACAO_CONFIG.maxPaginasVisiveis / 2));
    let fimPaginas = Math.min(PAGINACAO_CONFIG.totalPaginas, inicioPaginas + PAGINACAO_CONFIG.maxPaginasVisiveis - 1);
    
    // Ajustar se não estamos mostrando páginas suficientes
    if (fimPaginas - inicioPaginas + 1 < PAGINACAO_CONFIG.maxPaginasVisiveis) {
        inicioPaginas = Math.max(1, fimPaginas - PAGINACAO_CONFIG.maxPaginasVisiveis + 1);
    }
    
    // Adicionar botão para primeira página se necessário
    if (inicioPaginas > 1) {
        const btn = document.createElement('button');
        btn.className = 'numero-pagina';
        btn.textContent = '1';
        btn.addEventListener('click', () => irParaPagina(1));
        numerosPaginas.appendChild(btn);
        
        if (inicioPaginas > 2) {
            const ellipsis = document.createElement('span');
            ellipsis.textContent = '...';
            ellipsis.style.padding = '8px 5px';
            numerosPaginas.appendChild(ellipsis);
        }
    }
    
    // Adicionar números das páginas
    for (let i = inicioPaginas; i <= fimPaginas; i++) {
        const btn = document.createElement('button');
        btn.className = `numero-pagina ${i === PAGINACAO_CONFIG.paginaAtual ? 'ativo' : ''}`;
        btn.textContent = i;
        btn.addEventListener('click', () => irParaPagina(i));
        numerosPaginas.appendChild(btn);
    }
    
    // Adicionar botão para última página se necessário
    if (fimPaginas < PAGINACAO_CONFIG.totalPaginas) {
        if (fimPaginas < PAGINACAO_CONFIG.totalPaginas - 1) {
            const ellipsis = document.createElement('span');
            ellipsis.textContent = '...';
            ellipsis.style.padding = '8px 5px';
            numerosPaginas.appendChild(ellipsis);
        }
        
        const btn = document.createElement('button');
        btn.className = 'numero-pagina';
        btn.textContent = PAGINACAO_CONFIG.totalPaginas;
        btn.addEventListener('click', () => irParaPagina(PAGINACAO_CONFIG.totalPaginas));
        numerosPaginas.appendChild(btn);
    }
}

/**
 * Navega para uma página específica
 * @param {number} numeroPagina - Número da página para navegar
 */
function irParaPagina(numeroPagina) {
    if (numeroPagina < 1 || numeroPagina > PAGINACAO_CONFIG.totalPaginas) return;
    
    PAGINACAO_CONFIG.paginaAtual = numeroPagina;
    renderizarLivros();
    atualizarControlesPaginacao();
    
    // Rolagem suave para o topo da lista
    document.querySelector('.lista-container').scrollIntoView({ behavior: 'smooth' });
}

/**
 * Renderiza os livros da página atual
 */
function renderizarLivros() {
    if (!livrosFiltrados.length) {
        listaLivros.innerHTML = '<div class="loading">Nenhum livro encontrado</div>';
        return;
    }
    
    // Calcular índices dos livros a serem mostrados
    const inicio = (PAGINACAO_CONFIG.paginaAtual - 1) * PAGINACAO_CONFIG.itensPorPagina;
    const fim = inicio + PAGINACAO_CONFIG.itensPorPagina;
    const livrosParaMostrar = livrosFiltrados.slice(inicio, fim);
    
    listaLivros.innerHTML = '';
    
    livrosParaMostrar.forEach(l => {
        const div = document.createElement('div');
        div.className = 'livro';
        
        // Adicionar classe para livros recentes (adicionados nos últimos 7 dias)
        if (isLivroRecente(l)) {
            div.classList.add('livro-recente');
        }
        
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
        listaLivros.appendChild(div);
    });
}

/**
 * Verifica se um livro foi adicionado recentemente (últimos 7 dias)
 * @param {Object} livro - O livro a ser verificado
 * @returns {boolean} True se o livro é recente
 */
function isLivroRecente(livro) {
    if (!livro.dataAdicao) return false;
    
    try {
        const dataAdicao = new Date(livro.dataAdicao);
        const seteDiasAtras = new Date();
        seteDiasAtras.setDate(seteDiasAtras.getDate() - 7);
        
        return dataAdicao >= seteDiasAtras;
    } catch (e) {
        console.warn('Data de adição inválida:', livro.dataAdicao);
        return false;
    }
}

// ========== FUNÇÕES DE ORDENAÇÃO ========== //

/**
 * Ordena os livros com base no critério selecionado
 * @param {string} criterio - Critério de ordenação
 */
function ordenarLivros(criterio) {
    livrosOrdenados = [...livrosFiltrados];
    
    switch(criterio) {
        case 'recentes':
            // Ordenar por data de adição (mais recentes primeiro)
            livrosOrdenados.sort((a, b) => {
                const dataA = a.dataAdicao ? new Date(a.dataAdicao) : new Date(0);
                const dataB = b.dataAdicao ? new Date(b.dataAdicao) : new Date(0);
                return dataB - dataA; // Mais recente primeiro
            });
            break;
            
        case 'antigos':
            // Ordenar por data de adição (mais antigos primeiro)
            livrosOrdenados.sort((a, b) => {
                const dataA = a.dataAdicao ? new Date(a.dataAdicao) : new Date(0);
                const dataB = b.dataAdicao ? new Date(b.dataAdicao) : new Date(0);
                return dataA - dataB; // Mais antigo primeiro
            });
            break;
            
        case 'titulo':
            // Ordenar por título (A-Z)
            livrosOrdenados.sort((a, b) => {
                const tituloA = (a.titulo || '').toLowerCase();
                const tituloB = (b.titulo || '').toLowerCase();
                return tituloA.localeCompare(tituloB);
            });
            break;
            
        case 'autor':
            // Ordenar por autor (A-Z)
            livrosOrdenados.sort((a, b) => {
                const autorA = (a.autor || '').toLowerCase();
                const autorB = (b.autor || '').toLowerCase();
                return autorA.localeCompare(autorB);
            });
            break;
    }
    
    livrosFiltrados = livrosOrdenados;
}

// ========== FUNÇÕES EXISTENTES (com pequenas adaptações) ========== //

// Debounce para melhorar performance da busca
function debounceFiltrarLivros() {
    clearTimeout(timeoutBusca);
    timeoutBusca = setTimeout(filtrarLivros, 300);
}

function mostrarMensagem(texto, tipo) {
    mensagemDiv.innerHTML = `<div class="${tipo}">${texto}</div>`;
    if (tipo !== 'error') {
        setTimeout(() => { mensagemDiv.innerHTML = ''; }, 3000);
    }
}

// Exibir skeleton loading para melhor experiência do usuário
function mostrarSkeletonLoading() {
    listaLivros.innerHTML = '';
    
    for (let i = 0; i < 10; i++) {
        const div = document.createElement('div');
        div.className = 'livro';
        div.innerHTML = `
            <span><div class="skeleton"></div></span>
            <span><div class="skeleton"></div></span>
            <span><div class="skeleton"></div></span>
            <span><div class="skeleton"></div></span>
            <span><div class="skeleton"></div></span>
        `;
        listaLivros.appendChild(div);
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

function extrairGeneros() {
    const generosSet = new Set();
    dadosCompletos.forEach(livro => {
        if (livro.genero && livro.genero.trim() !== '') generosSet.add(livro.genero);
    });
    generosDisponiveis = Array.from(generosSet).sort();
    while (filtroGenero.options.length > 1) filtroGenero.remove(1);
    generosDisponiveis.forEach(genero => {
        const option = document.createElement('option');
        option.value = genero;
        option.textContent = genero;
        filtroGenero.appendChild(option);
    });
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

    // Aplicar ordenação após filtrar
    ordenarLivros(criterioOrdenacao);
    
    // Atualizar paginação
    calcularTotalPaginas();
    PAGINACAO_CONFIG.paginaAtual = 1; // Voltar para a primeira página
    
    // Renderizar resultados
    renderizarLivros();
    atualizarControlesPaginacao();
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
    if (colunaOrdenacaoAtual === coluna) {
        ordemAscendente = !ordemAscendente;
    } else {
        colunaOrdenacaoAtual = coluna;
        ordemAscendente = true;
    }
    ordenarLista();
}

// Verificar se os dados em cache ainda são válidos
function isCacheValid() {
    const timestamp = localStorage.getItem(CACHE_TIMESTAMP_KEY);
    if (!timestamp) return false;
    
    const now = new Date().getTime();
    return (now - parseInt(timestamp)) < CACHE_DURATION;
}

// Salvar dados no cache
function salvarNoCache(dados) {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(dados));
        localStorage.setItem(CACHE_TIMESTAMP_KEY, new Date().getTime().toString());
        return true;
    } catch (e) {
        console.warn('Falha ao salvar no cache local:', e);
        return false;
    }
}

// Recuperar dados do cache
function recuperarDoCache() {
    try {
        const cachedData = localStorage.getItem(CACHE_KEY);
        return cachedData ? JSON.parse(cachedData) : null;
    } catch (e) {
        console.warn('Falha ao recuperar do cache:', e);
        return null;
    }
}

// Carregar dados com estratégia cache-first
async function carregarDados() {
    // 1. Mostrar skeleton loading imediatamente
    mostrarSkeletonLoading();
    
    // 2. Tentar recuperar dados do cache se forem válidos
    if (isCacheValid()) {
        const cachedData = recuperarDoCache();
        if (cachedData) {
            // Validar dados do cache
            const validacao = validarDados(cachedData);
            dadosCompletos = validacao.livros;
            livrosAcervo = [...dadosCompletos];
            
            // Ordenar por padrão os mais recentes primeiro
            ordenarLivros('recentes');
            livrosFiltrados = livrosOrdenados;
            
            extrairGeneros();
            
            // Configurar paginação
            calcularTotalPaginas();
            renderizarLivros();
            atualizarControlesPaginacao();
            
            if (validacao.livrosCorrompidos > 0) {
                mostrarMensagem(`Dados carregados do cache (${validacao.livrosCorrompidos} livros recuperados)`, 'success');
            } else {
                mostrarMensagem('Dados carregados do cache.', 'success');
            }
            
            // Atualizar em segundo plano
            setTimeout(carregarDadosRemotos, 1000);
            return;
        }
    }
    
    // 3. Se não houver cache válido, carregar dados remotos
    await carregarDadosRemotos();
}

// Carregar dados remotos
async function carregarDadosRemotos() {
    try {
        mostrarMensagem('Sincronizando com servidor...', 'loading');
        
        // Adicionar timestamp para evitar cache do navegador
        const urlComTimestamp = `${URL_JSON}?t=${new Date().getTime()}`;
        const response = await fetch(urlComTimestamp);
        
        if (!response.ok) throw new Error(`Erro HTTP: ${response.status}`);
        const dadosBrutos = await response.json();
        
        // Validar os dados recebidos
        const validacao = validarDados(dadosBrutos);
        
        if (!validacao.valido && validacao.livros.length === 0) {
            throw new Error('Dados recebidos são inválidos e não puderam ser recuperados');
        }

        dadosCompletos = validacao.livros;
        livrosAcervo = [...dadosCompletos];

        // Ordenar por padrão os mais recentes primeiro
        ordenarLivros('recentes');
        livrosFiltrados = livrosOrdenados;

        // Preparar dados para cache (incluir metadados de validação)
        const dadosParaCache = {
            livros: dadosCompletos,
            validacao: {
                timestamp: new Date().toISOString(),
                totalLivros: validacao.totalLivros,
                livrosCorrompidos: validacao.livrosCorrompidos,
                livrosRecuperados: validacao.livrosRecuperados
            }
        };
        
        // Salvar no cache
        salvarNoCache(dadosParaCache);
        
        extrairGeneros();
        
        // Configurar paginação
        calcularTotalPaginas();
        renderizarLivros();
        atualizarControlesPaginacao();
        
        // Mostrar mensagem apropriada baseada na validação
        if (validacao.livrosCorrompidos > 0) {
            mostrarMensagem(`Dados atualizados! ${validacao.livrosCorrompidos} livro(s) recuperado(s) de forma automática.`, 'success');
        } else {
            mostrarMensagem('Dados atualizados com sucesso!', 'success');
        }
        
        // Log de erros de validação no console para debug
        if (validacao.errors.length > 0) {
            console.warn('Problemas encontrados na validação:', validacao.errors);
        }
    } catch (error) {
        console.error('Erro ao carregar dados remotos:', error);
        
        // Se falhar, tentar usar cache mesmo que expirado
        const cachedData = recuperarDoCache();
        if (cachedData) {
            const validacao = validarDados(cachedData);
            dadosCompletos = validacao.livros;
            livrosAcervo = [...dadosCompletos];
            
            // Ordenar por padrão os mais recentes primeiro
            ordenarLivros('recentes');
            livrosFiltrados = livrosOrdenados;
            
            extrairGeneros();
            
            // Configurar paginação
            calcularTotalPaginas();
            renderizarLivros();
            atualizarControlesPaginacao();
            
            mostrarMensagem('Usando dados em cache (possivelmente desatualizados).', 'error');
        } else {
            mostrarMensagem(`Erro ao carregar dados: ${error.message}`, 'error');
            listaLivros.innerHTML = '<div class="error">Erro ao carregar o acervo. Verifique sua conexão e tente novamente.</div>';
        }
    }
}
