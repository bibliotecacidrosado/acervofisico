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
    disponiveis: { tipo: 'number', obrigatorio: false, min: 0 }
};

// Variáveis globais
let livrosAcervo = [];
let dadosCompletos = [];
let generosDisponiveis = [];
let colunaOrdenacaoAtual = '';
let ordemAscendente = true;
let timeoutBusca = null;

// Elementos DOM (serão inicializados no DOMContentLoaded)
let buscaInput, filtroStatus, filtroGenero, listaLivros, mensagemDiv;

// Inicialização quando o documento estiver pronto
document.addEventListener('DOMContentLoaded', function() {
    // Configurar referências aos elementos DOM
    buscaInput = document.getElementById('busca');
    filtroStatus = document.getElementById('filtroStatus');
    filtroGenero = document.getElementById('filtroGenero');
    listaLivros = document.getElementById('listaLivros');
    mensagemDiv = document.getElementById('mensagem');
    
    // Configurar event listeners
    buscaInput.addEventListener('input', debounceFiltrarLivros);
    filtroStatus.addEventListener('change', filtrarLivros);
    filtroGenero.addEventListener('change', filtrarLivros);
    
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
    
    // Garantir que campos obrigatórios tenham valores padrão
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

function atualizarLista(dados) {
    atualizarResumo(dados);
    listaLivros.innerHTML = '';
    
    if (!dados.livros || dados.livros.length === 0) {
        listaLivros.innerHTML = '<div class="loading">Nenhum livro encontrado</div>';
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
        listaLivros.appendChild(div);
    });
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
            
            extrairGeneros();
            atualizarLista({ livros: dadosCompletos });
            
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
        atualizarLista({ livros: dadosCompletos });
        
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
            
            extrairGeneros();
            atualizarLista({ livros: dadosCompletos });
            mostrarMensagem('Usando dados em cache (possivelmente desatualizados).', 'error');
        } else {
            mostrarMensagem(`Erro ao carregar dados: ${error.message}`, 'error');
            listaLivros.innerHTML = '<div class="error">Erro ao carregar o acervo. Verifique sua conexão e tente novamente.</div>';
        }
    }
}
