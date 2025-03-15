// Configurações das APIs
const config = {
    rawgApiKey: '56c51b5ea1804883bc4cea63655ff316',
    newsApiKey: 'de00fe66530c47b29d5b7bb4e35e673c',
    rawgBaseUrl: 'https://api.rawg.io/api/',
    newsBaseUrl: 'https://newsapi.org/v2/',
    cacheTTL: 3600000 // 1 hora em milissegundos
};

// Cache simples em memória
const cache = new Map();

// Fetch com timeout e cache
async function fetchWithTimeout(url, options = {}, timeout = 10000) {
    if (cache.has(url) && (Date.now() - cache.get(url).timestamp < config.cacheTTL)) {
        return cache.get(url).data;
    }

    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        const data = await response.json();
        cache.set(url, { data, timestamp: Date.now() });
        clearTimeout(id);
        return data;
    } catch (error) {
        clearTimeout(id);
        throw error;
    }
}

// Função para obter o link direto da Steam
async function getSteamLink(game) {
    // Verificar se há uma loja Steam associada
    const steamStore = game.stores?.find(store => store.store?.id === 1); // 1 = Steam na API RAWG
    if (steamStore?.url) {
        const steamId = steamStore.url.match(/app\/(\d+)/)?.[1];
        if (steamId) {
            return `https://store.steampowered.com/app/${steamId}/`;
        }
    }

    // Se não houver URL válida, buscar detalhes do jogo na API RAWG
    try {
        const detailsUrl = `${config.rawgBaseUrl}games/${game.id || game.slug}?key=${config.rawgApiKey}`;
        const details = await fetchWithTimeout(detailsUrl);
        const detailedSteamStore = details.stores?.find(s => s.store.id === 1);
        const detailedSteamId = detailedSteamStore?.url?.match(/app\/(\d+)/)?.[1];
        if (detailedSteamId) {
            return `https://store.steampowered.com/app/${detailedSteamId}/`;
        }
    } catch (error) {
        console.warn(`Erro ao buscar detalhes do jogo ${game.name}:`, error);
    }

    // usar slug ou nome para busca na Steam
    const slugId = game.slug?.match(/(\d+)$/)?.[1];
    if (slugId) {
        return `https://store.steampowered.com/app/${slugId}/`;
    }

    // Último recurso: busca por nome
    return `https://store.steampowered.com/search/?term=${encodeURIComponent(game.name)}`;
}

// Exibir itens com links Steam e notícias
async function displayItems(items, containerId, type) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = items?.length ? '' : '<p class="error">Conteúdo não disponível</p>';
    if (!items?.length) return;

    const fragment = document.createDocumentFragment();
    const defaultImage = 'https://via.placeholder.com/320x180?text=Imagem+Indisponível';

    for (const item of items) {
        const div = document.createElement('div');
        div.className = 'item';

        if (type === 'news') {
            div.innerHTML = `
                <img src="${item.urlToImage || defaultImage}" alt="${item.title}" class="news-thumbnail" loading="lazy">
                <div class="item-content">
                    <h3><a href="${item.url}" target="_blank" rel="noopener noreferrer" class="news-link">${item.title}</a></h3>
                    <p>${item.description || 'Sem descrição'}</p>
                    <div class="news-footer">
                        <span>${item.source?.name || 'Fonte desconhecida'}</span>
                        <span>${new Date(item.publishedAt).toLocaleDateString('pt-BR')}</span>
                    </div>
                </div>
            `;
        } else {
            const steamLink = await getSteamLink(item); // Tentar buscar link da Steam
            div.innerHTML = `
                <img src="${item.background_image || defaultImage}" alt="${item.name}" class="game-thumbnail" loading="lazy">
                <div class="item-content">
                    <h3>${item.name}</h3>
                    <div class="game-info">
                        ${item.released ? `<p class="release-date">🗓️ ${new Date(item.released).toLocaleDateString('pt-BR')}</p>` : ''}
                        ${item.rating ? `<p class="rating">⭐ ${item.rating}/5 (${(item.reviews_count || 0).toLocaleString()} avaliações)</p>` : ''}
                    </div>
                    <a href="${steamLink}" target="_blank" rel="noopener noreferrer" class="steam-button">
                        Ver na Steam <i class="fas fa-external-link-alt"></i>
                    </a>
                </div>
            `;
        }
        fragment.appendChild(div);
    }
    container.appendChild(fragment);
}

// Funções de fetch
async function fetchData(url, containerId, type, filterFn = null) {
    try {
        const data = await fetchWithTimeout(url);
        const items = filterFn ? data.results.filter(filterFn) : (data.articles || data.results);
        await displayItems(items, containerId, type); // Aguardar renderização sincronizada dos itens
    } catch (error) {
        document.getElementById(containerId).innerHTML = `<p class="error">Erro: ${error.message || 'Falha na conexão'}</p>`;
    }
}

const apiCalls = {
    news: () => fetchData(
        `${config.newsBaseUrl}everything?q=videogames&language=pt&sortBy=publishedAt&pageSize=10&apiKey=${config.newsApiKey}`,
        'news-list',
        'news'
    ),
    popularGames: () => fetchData(
        `${config.rawgBaseUrl}games?key=${config.rawgApiKey}&platforms=1&stores=1&ordering=-added&page_size=10`,
        'popular-games-list',
        'game',
        game => game.platforms?.some(p => p.platform.id === 1) && game.stores?.some(s => s.store.id === 1)
    ),
    upcomingGames: () => fetchData(
        `${config.rawgBaseUrl}games?key=${config.rawgApiKey}&platforms=1&stores=1&dates=2025-01-01,2025-12-31&ordering=-released&page_size=10`,
        'upcoming-games-list',
        'game',
        game => new Date(game.released) > new Date() && game.stores?.some(s => s.store.id === 1)
    )
};

// CARROSSEL
function initCarousel() {
    const tracks = ['news-list', 'popular-games-list', 'upcoming-games-list'];
    tracks.forEach(trackId => {
        const track = document.getElementById(trackId);
        if (!track) return;

        let autoplay;
        const startAutoplay = () => {
            autoplay = setInterval(() => track.scrollBy({ left: 344, behavior: 'smooth' }), 5000);
        };
        startAutoplay();

        track.addEventListener('mouseenter', () => clearInterval(autoplay));
        track.addEventListener('mouseleave', startAutoplay);

        const prevBtn = document.querySelector(`.carousel-prev[data-target="${trackId}"]`);
        const nextBtn = document.querySelector(`.carousel-next[data-target="${trackId}"]`);
        prevBtn?.addEventListener('click', () => track.scrollBy({ left: -344, behavior: 'smooth' }));
        nextBtn?.addEventListener('click', () => track.scrollBy({ left: 344, behavior: 'smooth' }));
    });
}

// Navbar scroll effect
function initNavbarScroll() {
    const navbar = document.querySelector('.navbar');
    const observer = new IntersectionObserver(
        ([entry]) => navbar.classList.toggle('scrolled', !entry.isIntersecting),
        { threshold: 0.1 }
    );
    observer.observe(document.querySelector('.hero'));
}

// Lazy loading de imagens
function initLazyLoading() {
    const images = document.querySelectorAll('img[loading="lazy"]');
    images.forEach(img => {
        img.addEventListener('error', () => {
            img.src = 'https://via.placeholder.com/320x180?text=Imagem+Indisponível';
        });
    });
}

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    initCarousel();
    initNavbarScroll();
    initLazyLoading();
    Promise.all(Object.values(apiCalls).map(fn => fn()))
        .catch(error => console.error('Erro ao inicializar:', error));
});