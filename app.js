(() => {
    const $ = (s,
    root=document) => root.querySelector(s);
    const $$ = (s,
    root=document) => [...root.querySelectorAll(s)];
    const STORAGE = 'gamenest_v1';
    const { STATUSES, seedGames } = window.GameNestData;
    const session = window.GameNestSession;
    const statusClass = s => s==='Граю'?'playing':s==='Закінчена'?'completed':s==='Відкладена'?'wishlist':'';
    // Catalog, library and proposals are still local (this browser only) until their backend integration.
    // Users, passwords and roles are NOT stored locally any more: they come from the backend session.
    const LOCAL_NOTICE = 'Ці дані поки зберігаються лише в цьому браузері й не синхронізуються із сервером GameNest.';
    let rerender = () => discover();

function fresh(){
    return {
        games:seedGames,
libraries:{
},
proposals:[{
    id:'p1',
    userId:'demo',
    title:'Hades II',
    platform:'PC',
    genre:'Action',
    description:'Динамічна action-гра',
    status:'На розгляді',
    createdAt:'2026-10-20'
},
{
    id:'p2',
    userId:'demo',
    title:'Silent Hill f',
    platform:'PC',
    genre:'Horror',
    description:'Горор-пригода',
    status:'Схвалено',
    createdAt:'2026-10-21'
}
],
lists:{
    demo:[]
}
}
}

function loadDatabase() {
    try {
        const saved = localStorage.getItem(STORAGE);

        if (!saved) {
            return fresh();
        }

        const parsed = JSON.parse(saved);

        if (
            !parsed ||
            typeof parsed !== 'object' ||
            !Array.isArray(parsed.games)
        ) {
            return fresh();
        }

        // Older versions stored demo users with plain-text passwords and the logged-in user here.
        // Drop them; the purged data is written back below.
        const { users, currentUser, ...rest } = parsed;
        const migrated = {
            ...fresh(),
            ...rest,
            libraries: rest.libraries || {},
            proposals: Array.isArray(rest.proposals)
                ? rest.proposals
                : [],
            lists: rest.lists || {}
        };
        if (users !== undefined || currentUser !== undefined) {
            try { localStorage.setItem(STORAGE, JSON.stringify(migrated)); } catch { /* ignore */ }
        }
        return migrated;
    } catch (error) {
        console.error('Помилка завантаження даних:', error);
        return fresh();
    }
}

let db = loadDatabase();

function save() {
    try {
        localStorage.setItem(STORAGE, JSON.stringify(db));
        return true;
    } catch (error) {
        console.error('Помилка збереження даних:', error);
        toast('Не вдалося зберегти дані. Перевір доступне місце у сховищі.');
        return false;
    }
}

function esc(v=''){
    return String(v).replace(/[&<>"']/g,
    c=>({
        '&':'&amp;',
        '<':'&lt;',
        '>':'&gt;',
        '"':'&quot;',
        "'":'&#39;'
    }
[c]))
}
// Signed-in user from GET /api/Profile ({ id, username, email, role, emailConfirmed, isAdmin }), or null.
function me(){
    return session.isAuthenticated?session.user:null
}
// Local library of the signed-in backend user (keyed by the backend user id).
function library(){
    const u=me();
    if(!u)return {};
    const key='user:'+u.id;
    return db.libraries[key]||(db.libraries[key]={
    })
}
function localNotice(){
    return `
            <div class="notice" role="note">${esc(LOCAL_NOTICE)}
            </div>`
}
function gameById(id){
    return db.games.find(g=>g.id===id)
}
function toast(msg){
    const el=$('#toast');
    el.textContent=msg;
    el.classList.add('show');
    clearTimeout(toast.t);
    toast.t=setTimeout(()=>el.classList.remove('show'),
    2800)
}
function sessionControls(u){
    if(u)return `
            <button data-action="logout">Вийти
            </button>
            <span class="user-pill" title="${esc(u.username)}">${esc((u.username||'?').slice(0,1).toUpperCase())}
            </span>`;
    const st=session.state.status;
    if(st==='loading')return `
            <button class="login" disabled aria-busy="true">Вхід…
            </button>`;
    if(st==='error')return `
            <button class="login" data-action="retry-profile" title="${esc(session.state.error||'')}">Профіль недоступний · повторити
            </button>
            <button data-action="logout">Вийти
            </button>`;
    return `
            <button class="login" data-go="auth">Увійти через Google
            </button>`
}
function header(active='discover'){
    const u=me();
    return `
            <header class="topbar">
            <a class="brand" href="#" data-go="discover">
            <img src="assets/gamenest-logo.png" alt="GameNest">
            <div>Game
            <span>Nest
            </span>
            </div>
            </a>
            <nav class="nav">
            <button data-go="discover" class="${active==='discover'?'active':''}">⌕ &nbsp;Каталог
            </button>
            <button data-go="library" class="${active==='library'?'active':''}">▣ &nbsp;Моя бібліотека
            </button>
            <button data-go="profile" class="${active==='profile'?'active':''}">☆ &nbsp;Кабінет
            </button>${u&&u.isAdmin?`
            <button data-go="admin" class="${active==='admin'?'active':''}">⚙ &nbsp;Адмінпанель
            </button>`:''}${sessionControls(u)}
            </nav>
            </header>`
}
function layout(content,
active){
    $('#app').innerHTML=`
            <div class="shell">${header(active)}${content}
            <footer class="footer">
            <span>GAMENEST · PERSONAL GAME TRACKER
            </span>
            <span>Твоя колекція. Твій темп. Без автоматичних відсотків проходження.
            </span>
            </footer>
            </div>`;
    bind()
}
function poster(g){
    return `
            <div class="poster ${esc(g.poster||'p1')}">
            <span class="poster-title">${esc(g.title)}
            </span>
            </div>`
}

function gameCard(g) {
    const st = library()[g.id];

    return `
        <article class="game-card" aria-label="Гра ${esc(g.title)}">
            ${poster(g)}

            <div class="card-body">
                <div class="card-title-row">
                    <div>
                        <h3>${esc(g.title)}</h3>
                        <div class="small muted">
                            ${esc(g.platform)} · ${esc(g.year)}
                        </div>
                    </div>

                    ${st ? `
                        <span
                            class="status ${statusClass(st)}"
                            aria-label="Статус гри: ${esc(st)}"
                        >
                            ${esc(st)}
                        </span>
                    ` : ''}
                </div>

                <div class="tag-row">
                    <span class="tag">${esc(g.genre)}</span>
                    <span class="tag">
                        ${esc(g.developer || 'Невідомий розробник')}
                    </span>
                </div>

                <div class="card-bottom">
                    <button
                        class="btn"
                        data-game="${esc(g.id)}"
                        aria-label="Детальніше про гру ${esc(g.title)}"
                    >
                        Детальніше
                    </button>

                    ${st ? `
                        <button
                            class="icon-btn"
                            title="Змінити статус"
                            aria-label="Змінити статус гри ${esc(g.title)}"
                            data-status="${esc(g.id)}"
                        >
                            ↻
                        </button>
                    ` : `
                        <button
                            class="icon-btn"
                            title="Додати до бібліотеки"
                            aria-label="Додати гру ${esc(g.title)} до бібліотеки"
                            data-add="${esc(g.id)}"
                        >
                            ＋
                        </button>
                    `}
                </div>
            </div>
        </article>
    `;
}

// ---------- Public catalog from the API (GameNestCatalog) ----------
// API games use numeric ids and their own detail page (apiDetail); local demo games keep gameById()/detail().
const catalogView={search:'',sort:'asc'};
const releaseDateFormat=new Intl.DateTimeFormat('uk-UA',{timeZone:'UTC',day:'numeric',month:'long',year:'numeric'});
function pluralGames(n){
    const m10=n%10,m100=n%100;
    if(m10===1&&m100!==11)return `${n} гра`;
    if(m10>=2&&m10<=4&&(m100<12||m100>14))return `${n} гри`;
    return `${n} ігор`
}
// Placeholder style chosen from the id, so a game always gets the same gradient.
function apiPoster(g){
    const style='p'+((g.id%6)+1);
    return `
            <div class="poster ${style}${g.coverUrl?' has-cover':''}">${g.coverUrl?`
            <img class="poster-cover" src="${esc(g.coverUrl)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-cover>`:''}
            <span class="poster-title">${esc(g.title)}
            </span>
            </div>`
}
function apiGameMeta(g){
    return [g.developer,g.releaseYear].filter(Boolean).map(esc).join(' · ')
}
function apiGameCard(g){
    return `
        <article class="game-card" aria-label="Гра ${esc(g.title)}">
            ${apiPoster(g)}
            <div class="card-body">
                <div class="card-title-row">
                    <div>
                        <h3>${esc(g.title)}</h3>
                        <div class="small muted">${apiGameMeta(g)||'&nbsp;'}</div>
                    </div>
                </div>${g.publisher?`
                <div class="tag-row">
                    <span class="tag">${esc(g.publisher)}</span>
                </div>`:''}
                <div class="card-bottom">
                    <button class="btn" data-api-game="${esc(g.id)}" aria-label="Детальніше про гру ${esc(g.title)}">
                        Детальніше
                    </button>
                </div>
            </div>
        </article>`
}
function catalogResults(){
    const cs=window.GameNestCatalog.state;
    if(cs.status==='idle'||cs.status==='loading')return `
            <div class="empty" style="grid-column:1/-1" role="status" aria-live="polite" aria-busy="true">
            <h3>Завантажуємо каталог…
            </h3>
            <p>Перший запит може тривати до хвилини, поки сервер прокидається.
            </p>
            </div>`;
    if(cs.status==='error')return `
            <div class="empty" style="grid-column:1/-1" role="alert">
            <h3>Не вдалося завантажити каталог
            </h3>
            <p>${esc(cs.error||'Спробуй ще раз трохи пізніше.')}
            </p>
            <button class="btn primary" data-action="catalog-retry">Спробувати ще раз
            </button>
            </div>`;
    if(!cs.games.length)return `
            <div class="empty" style="grid-column:1/-1">
            <h3>Каталог поки порожній
            </h3>
            <p>Ігри з’являться тут, щойно адміністратор додасть їх до каталогу GameNest.
            </p>
            </div>`;
    const games=window.GameNestCatalog.query(cs.games,catalogView);
    return games.length?games.map(apiGameCard).join(''):`
            <div class="empty" style="grid-column:1/-1">
            <h3>Нічого не знайдено
            </h3>
            <p>Спробуй змінити пошуковий запит.
            </p>
            </div>`
}
function catalogCount(){
    const cs=window.GameNestCatalog.state;
    return cs.status==='success'?pluralGames(cs.games.length):cs.status==='error'?'Недоступно':'Завантаження…'
}
function discover(){
    rerender=()=>discover();
    const cs=window.GameNestCatalog.state;
    const ready=cs.status==='success'&&cs.games.length>0;
    const content=`
            <main class="container" data-page="discover">
            <section class="hero">
            <div>
            <div class="eyebrow">Твій особистий ігровий простір

            </div>
            <h1>Твої ігри.
            <br>
            <span class="accent">Твоя подорож.
            </span>
            </h1>
            <p>Збирай ігрову бібліотеку, впорядковуй колекцію та відкривай, у що пограти далі. Статуси проходження ти контролюєш самостійно.
            </p>
            <div class="hero-actions">
            <button class="btn primary" data-scroll="catalog">Переглянути каталог&nbsp; →
            </button>
            <button class="btn" data-go="library">Моя бібліотека
            </button>
            </div>
            </div>
            <div class="hero-art">
            <img src="assets/gamenest-logo.png" alt="">
            </div>
            </section>
            <div class="section-head" id="catalog">
            <div>
            <div class="eyebrow">Вибирай наступну пригоду
            </div>
            <h2>Каталог ігор
            </h2>
            <p class="muted small">Знайди гру за назвою, розробником, видавцем або описом.
            </p>
            </div>
            <span class="status" id="catalogCount">${catalogCount()}
            </span>
            </div>${ready?`
        <div class="toolbar">
            <input
                class="search"
                id="gameSearch"
                type="search"
                placeholder="⌕ Пошук ігор..."
                aria-label="Пошук ігор"
                value="${esc(catalogView.search)}"
            >

            <select class="search" id="gameSort" aria-label="Сортування за назвою">
                <option value="asc" ${catalogView.sort==='asc'?'selected':''}>Назва: А → Я</option>
                <option value="desc" ${catalogView.sort==='desc'?'selected':''}>Назва: Я → А</option>
            </select>

            <button class="btn" id="resetFilters" type="button">
                Скинути
            </button>
        </div>`:''}

            <div class="grid" id="gameGrid">${catalogResults()}
            </div>
            </main>`;
    layout(content,
    'discover');
    bindCatalogControls();
    bindCatalogGrid();
    if(cs.status==='idle')window.GameNestCatalog.load();
}
function openApiGame(el){
    const id=Number(el.dataset.apiGame);
    if(Number.isInteger(id)&&id>0)apiDetail(id)
}
// A broken cover image falls back to the gradient placeholder underneath it.
function onCoverError(img){
    img.closest('.poster')?.classList.remove('has-cover');
    img.remove()
}
// Delegated listeners, attached once per #gameGrid element (discover() creates a new one).
// Search, sort and reset only replace the grid's content, so no listeners pile up.
function bindCatalogGrid(){
    const grid=$('#gameGrid');
    if(!grid)return;
    grid.addEventListener('click',e=>{
        const retry=e.target.closest('[data-action="catalog-retry"]');
        if(retry&&grid.contains(retry)){
            window.GameNestCatalog.load({force:true});
            return
        }
        const card=e.target.closest('[data-api-game]');
        if(card&&grid.contains(card))openApiGame(card)
    });
    // "error" does not bubble, so it is caught in the capture phase.
    grid.addEventListener('error',e=>{
        if(e.target instanceof HTMLImageElement&&e.target.matches('img[data-cover]'))onCoverError(e.target)
    },true)
}
function bindCatalogControls(){
    const search=$('#gameSearch'),sort=$('#gameSort'),reset=$('#resetFilters');
    if(search)search.addEventListener('input',()=>{catalogView.search=search.value;renderCatalogResults()});
    if(sort)sort.addEventListener('change',()=>{catalogView.sort=sort.value==='desc'?'desc':'asc';renderCatalogResults()});
    if(reset)reset.addEventListener('click',()=>{
        catalogView.search='';
        catalogView.sort='asc';
        if(search)search.value='';
        if(sort)sort.value='asc';
        renderCatalogResults()
    });
}
// Updates only the grid, so the search field keeps focus while typing.
function renderCatalogResults(){
    const grid=$('#gameGrid');
    if(!grid)return;
    grid.innerHTML=catalogResults()
}
// API game detail page: always fetched from GET /api/Games/{id}.
// Every page function assigns `rerender` when it renders, so a response may only render while `rerender`
// is still this very call: navigating anywhere else (another page, another or the same API game again,
// a session re-render) makes it stale.
function apiDetail(id){
    const view=()=>apiDetail(id);
    rerender=view;
    const isCurrent=()=>rerender===view;
    const cached=window.GameNestCatalog.cachedById(id);
    renderApiDetail(id,{status:'loading',game:cached});
    window.GameNestCatalog.fetchById(id).then(game=>{
        if(!isCurrent())return;
        renderApiDetail(id,game?{status:'success',game}:{status:'not-found'})
    }).catch(error=>{
        if(!isCurrent())return;
        renderApiDetail(id,{status:'error',error:window.GameNestApi.describeError(error)})
    })
}
function renderApiDetail(id,view){
    const back=`
            <button class="btn" data-go="discover">← Назад до каталогу
            </button>`;
    if(view.status==='not-found'||view.status==='error'||(view.status==='loading'&&!view.game)){
        const body=view.status==='loading'?`
            <div class="empty" role="status" aria-live="polite" aria-busy="true">
            <h3>Завантажуємо гру…
            </h3>
            </div>`:view.status==='not-found'?`
            <div class="empty" role="alert">
            <h3>Гру не знайдено
            </h3>
            <p>Можливо, її видалили з каталогу або посилання застаріло.
            </p>
            <button class="btn primary" data-go="discover">До каталогу
            </button>
            </div>`:`
            <div class="empty" role="alert">
            <h3>Не вдалося завантажити гру
            </h3>
            <p>${esc(view.error||'Спробуй ще раз трохи пізніше.')}
            </p>
            <button class="btn primary" data-api-game="${esc(id)}">Спробувати ще раз
            </button>
            </div>`;
        layout(`
            <main class="container" data-page="game">${back}
            <div style="margin-top:22px">${body}
            </div>
            </main>`,'discover');
        return
    }
    const g=view.game;
    const facts=[
        ['Розробник',g.developer],
        ['Видавець',g.publisher],
        ['Дата виходу',g.releaseDate?releaseDateFormat.format(g.releaseDate):'']
    ].filter(([,v])=>v);
    layout(`
            <main class="container" data-page="game">${back}
            <div class="detail-layout" style="margin-top:22px">
            <section>
            <div class="detail-poster">${apiPoster(g)}
            </div>
            <div class="section-head">
            <div>${g.releaseYear?`
            <div class="eyebrow">${esc(g.releaseYear)}
            </div>`:''}
            <h1 style="font-size:38px">${esc(g.title)}
            </h1>
            <p class="muted">${[g.developer,g.publisher].filter(Boolean).map(esc).join(' · ')}
            </p>
            </div>
            </div>
            <h3>Про гру
            </h3>
            <p style="line-height:1.8;color:#6e655f">${esc(g.description||'Опис цієї гри ще не додано.')}
            </p>${view.status==='loading'?`
            <div class="notice" role="status" aria-busy="true">Оновлюємо дані гри…
            </div>`:''}
            </section>
            <aside class="panel">
            <h3>Про видання
            </h3>${facts.length?facts.map(([k,v])=>`
            <div class="field">
            <label>${esc(k)}
            </label>
            <div>${esc(v)}
            </div>
            </div>`).join(''):`
            <p class="muted small">Додаткових відомостей поки немає.
            </p>`}${g.trailerUrl?`
            <a class="btn" style="width:100%;margin-top:14px;text-align:center;display:block" href="${esc(g.trailerUrl)}" target="_blank" rel="noopener noreferrer">▶ Дивитися трейлер
            </a>`:''}
            <hr class="divider">
            <h3>Моя бібліотека
            </h3>
            <p class="muted small">Додавання ігор із каталогу до бібліотеки з’явиться після синхронізації бібліотеки з сервером GameNest.
            </p>
            </aside>
            </div>
            </main>`,
'discover')
}
function auth(){
    rerender=()=>auth();
    const st=session.state;
    if(me()){
        go('discover');
        return
    }
    const configured=!!window.GameNestConfig.googleClientId;
    const busy=st.status==='loading';
    $('#app').innerHTML=
    `
            <div class="shell">${header('')}
            <main class="auth-wrap">
            <section class="auth-card">
            <div class="auth-brand">
            <img src="assets/gamenest-logo.png" alt="">
            <div class="eyebrow">Ласкаво просимо до GameNest
            </div>
            <h2>Увійди або створи акаунт
            </h2>
            <p class="muted small">Вхід і реєстрація відбуваються через Google. Новий акаунт GameNest створюється автоматично під час першого входу.
            </p>
            </div>${st.error?`
            <div class="notice" role="alert" id="authError">${esc(st.error)}
            </div>`:''}${st.status==='error'?`
            <div style="display:flex;gap:10px;margin:12px 0">
            <button class="btn primary" data-action="retry-profile">Повторити завантаження профілю
            </button>
            <button class="btn" data-action="logout">Вийти
            </button>
            </div>`:''}${busy?`
            <div class="notice" role="status" aria-live="polite" aria-busy="true">Виконуємо вхід… Перший запит може тривати до хвилини, поки сервер прокидається.
            </div>`:configured?`
            <div id="googleButton" style="display:flex;justify-content:center;min-height:44px;margin:18px 0" aria-label="Увійти через Google">
            </div>`:`
            <div class="notice" role="alert">Вхід через Google ще не налаштовано: у <code>config.js</code> не задано Google Client ID.
            </div>`}
            <p class="small muted">GameNest отримує від Google лише підтверджені ім’я, електронну пошту та фото профілю. Пароль Google нам не передається.
            </p>
            </section>
            </main>
            </div>`;
    bind();
    if(configured&&!busy){
        const container=$('#googleButton');
        session.renderGoogleButton(container,onGoogleCredential).catch(()=>{
            if(container)container.innerHTML=`
            <div class="notice" role="alert">Не вдалося завантажити кнопку Google. Перевір з’єднання або вимкни блокувальник скриптів і онови сторінку.
            </div>`
        })
    }
}
async function onGoogleCredential(credential){
    try{
        const {user,isNewUser}=await session.signInWithGoogle(credential);
        if(user){
            toast(isNewUser?`Акаунт створено. Вітаємо, ${user.username}!`:`Вхід виконано. Привіт, ${user.username}!`);
            go('discover')
        }
    }catch{
        // The error is already in the session state and shown on the auth page.
        auth()
    }
}
function libraryPage(){
    rerender=()=>libraryPage();
    const u=me();
    if(!u){
        auth();
        return
    }
const items=Object.entries(library()).map(([id,
status])=>({
    g:gameById(id),
    status
}
)).filter(x=>x.g);
const groups=STATUSES.map(s=>({
    s,
    n:items.filter(x=>x.status===s).length
}
));
const content=`
            <main class="container">
            <div class="section-head">
            <div>
            <div class="eyebrow">Твоя колекція
            </div>
            <h1 style="font-size:36px">Моя бібліотека
            </h1>
            <p class="muted">Відстежуй ігри за власними статусами. GameNest не рахує відсоток проходження автоматично.
            </p>
            </div>
            <button class="btn primary" data-go="discover">Переглянути каталог
            </button>
            </div>
            ${localNotice()}
            <div class="stat-grid">${[{label:'Ігор у бібліотеці',n:items.length},{label:'Закінчено',n:groups.find(x=>x.s==='Закінчена').n},{label:'Зараз граю',n:groups.find(x=>x.s==='Граю').n}].map(x=>`
            <div class="stat">
            <span class="muted small">${x.label}
            </span>
            <strong>${x.n}
            </strong>
            </div>`).join('')}
            </div>
            <div class="toolbar filters" id="libraryFilters">
            <button class="chip active" data-libfilter="">Усі (${items.length})
            </button>${groups.map(x=>`
            <button class="chip" data-libfilter="${esc(x.s)}">${esc(x.s)} (${x.n})
            </button>`).join('')}
            </div>
            <div class="grid" id="libraryGrid">${items.length?items.map(x=>gameCard({...x.g,libraryStatus:x.status})).join(''):`
            <div class="empty" style="grid-column:1/-1">
            <h3>Бібліотека поки порожня
            </h3>
            <p>Бібліотека поки зберігається лише в цьому браузері. Додавання ігор із каталогу GameNest з’явиться після синхронізації бібліотеки з сервером.
            </p>
            <button class="btn primary" data-go="discover">Відкрити каталог
            </button>
            </div>`}
            </div>
            <div class="section-head">
            <div>
            <h2>Запропонувати нову гру
            </h2>
            <p class="muted small">Не знайшов гру? Надішли її адміністратору на розгляд.
            </p>
            </div>
            </div>
            <section class="panel">
            <form id="proposalForm" class="form-grid">
            <div class="field">
            <label>Назва гри *
            </label>
            <input name="title" required placeholder="Наприклад, Hollow Knight: Silksong">
            </div>
            <div class="field">
            <label>Платформа *
            </label>
            <select name="platform" required>
            <option value="">Обери платформу
            </option>
            <option>PC
            </option>
            <option>PlayStation
            </option>
            <option>Xbox
            </option>
            <option>Nintendo Switch
            </option>
            <option>Mobile
            </option>
            <option>Інша
            </option>
            </select>
            </div>
            <div class="field">
            <label>Жанр *
            </label>
            <select name="genre" required>
            <option value="">Обери жанр
            </option>${['RPG','Action','Пригоди','Horror','Survival','Симулятор','Strategy','Indie','Інший'].map(x=>`
            <option>${x}
            </option>`).join('')}
            </select>
            </div>
            <div class="field wide">
            <label>Посилання або короткий опис
            </label>
            <input name="description" placeholder="Посилання на сторінку гри або опис">
            </div>
            <div class="wide">
            <button class="btn primary">Надіслати пропозицію
            </button>
            </div>
            </form>
            </section>
            <div class="section-head">
            <div>
            <h2>Мої пропозиції
            </h2>
            <p class="muted small">Статус змінюється після перевірки адміністратором.
            </p>
            </div>
            </div>
            <div class="table-wrap">
            <table>
            <thead>
            <tr>
            <th>Назва гри
            </th>
            <th>Платформа · Жанр
            </th>
            <th>Дата
            </th>
            <th>Статус
            </th>
            </tr>
            </thead>
            <tbody>${db.proposals.filter(p=>p.userId===u.id).map(p=>`
            <tr>
            <td>
            <b>${esc(p.title)}
            </b>
            </td>
            <td>${esc(p.platform)} · ${esc(p.genre)}
            </td>
            <td>${esc(p.createdAt)}
            </td>
            <td>
            <span class="status ${p.status==='Схвалено'?'approved':p.status==='Відхилено'?'rejected':'pending'}">${esc(p.status)}
            </span>
            </td>
            </tr>`).join('')||`
            <tr>
            <td colspan="4" class="muted">Ти ще не надсилав пропозицій.
            </td>
            </tr>`}
            </tbody>
            </table>
            </div>
            </main>`;
layout(content,
'library');
$$('[data-libfilter]').forEach(b=>b.addEventListener('click',
()=>{
    $$('[data-libfilter]').forEach(x=>x.classList.toggle('active',
    x===b));
    const st=b.dataset.libfilter;
    const filtered=items.filter(x=>!st||x.status===st);
    $('#libraryGrid').innerHTML=filtered.length?filtered.map(x=>gameCard(x.g)).join(''):`
            <div class="empty" style="grid-column:1/-1">У цій категорії поки немає ігор.
            </div>`;
    bind()
}
));
$('#proposalForm').addEventListener('submit',
e=>{
    e.preventDefault();
    const f=new FormData(e.target);
    db.proposals.unshift({
        id:'p'+Date.now(),
        userId:u.id,
        userName:u.username,
        title:f.get('title').trim(),
        platform:f.get('platform'),
        genre:f.get('genre'),
        description:f.get('description').trim(),
        status:'На розгляді',
        createdAt:new Date().toISOString().slice(0,
        10)
    }
);
save();
toast('Пропозицію надіслано адміністратору.');
libraryPage()
}
)
}
function profile(){
    rerender=()=>profile();
    const u=me();
    if(!u){
        auth();
        return
    }
const myprops=db.proposals.filter(p=>p.userId===u.id);
layout(`
            <main class="container">
            <div class="eyebrow">Особистий простір
            </div>
            <h1 style="font-size:36px">Особистий кабінет
            </h1>
            <p class="muted">Профіль, бібліотека та пропозиції нових ігор.
            </p>
            ${localNotice()}
            <div class="layout-two" style="margin-top:25px">
            <aside class="sidebar">
            <div class="profile-head">
            <div class="avatar">${esc((u.username||'?').slice(0,1).toUpperCase())}
            </div>
            <div>
            <h3 style="margin:0">${esc(u.username)}
            </h3>
            <span class="small muted">${esc(u.email)}${u.isAdmin?' · Адміністратор':''}
            </span>
            </div>
            </div>
            <nav class="side-nav">
            <button data-go="library">▣ Моя бібліотека
            </button>
            <button data-go="library">☆ Мої пропозиції
            </button>
            <button data-go="settings">⚙ Налаштування профілю
            </button>
            <button data-action="logout">↪ Вийти
            </button>
            </nav>
            </aside>
            <section>
            <div class="stat-grid">
            <div class="stat">
            <span class="muted small">Мої ігри
            </span>
            <strong>${Object.keys(library()).length}
            </strong>
            </div>
            <div class="stat">
            <span class="muted small">Пропозиції
            </span>
            <strong>${myprops.length}
            </strong>
            </div>
            <div class="stat">
            <span class="muted small">На розгляді
            </span>
            <strong>${myprops.filter(p=>p.status==='На розгляді').length}
            </strong>
            </div>
            </div>
            <div class="section-head">
            <div>
            <h2>Запропонувати гру
            </h2>
            <p class="muted small">Запропонуй гру, якої ще немає в каталозі.
            </p>
            </div>
            </div>
            <section class="panel">
            <form id="proposalForm" class="form-grid">
            <div class="field">
            <label>Назва гри *
            </label>
            <input name="title" required placeholder="Назва гри">
            </div>
            <div class="field">
            <label>Платформа *
            </label>
            <select name="platform" required>
            <option value="">Обери
            </option>
            <option>PC
            </option>
            <option>PlayStation
            </option>
            <option>Xbox
            </option>
            <option>Nintendo Switch
            </option>
            <option>Mobile
            </option>
            <option>Інша
            </option>
            </select>
            </div>
            <div class="field">
            <label>Жанр *
            </label>
            <select name="genre" required>
            <option value="">Обери
            </option>${['RPG','Action','Пригоди','Horror','Survival','Симулятор','Strategy','Indie','Інший'].map(x=>`
            <option>${x}
            </option>`).join('')}
            </select>
            </div>
            <div class="field">
            <label>Посилання / опис
            </label>
            <input name="description" placeholder="Необов’язково">
            </div>
            <div class="wide">
            <button class="btn primary">Надіслати пропозицію
            </button>
            </div>
            </form>
            </section>
            <div class="section-head">
            <h2>Останні пропозиції
            </h2>
            <button class="btn" data-go="library">Переглянути всі
            </button>
            </div>${myprops.slice(0,3).map(p=>`
            <div class="panel" style="margin-bottom:10px;display:flex;justify-content:space-between;gap:12px;align-items:center">
            <div>
            <b>${esc(p.title)}
            </b>
            <div class="small muted">${esc(p.platform)} · ${esc(p.genre)}
            </div>
            </div>
            <span class="status ${p.status==='Схвалено'?'approved':p.status==='Відхилено'?'rejected':'pending'}">${esc(p.status)}
            </span>
            </div>`).join('')||'<div class="empty">Поки що немає пропозицій.</div>'}
            </section>
            </div>
            </main>`,
'profile');
$('#proposalForm').addEventListener('submit',
e=>{
    e.preventDefault();
    const f=new FormData(e.target);
    db.proposals.unshift({
        id:'p'+Date.now(),
        userId:u.id,
        userName:u.username,
        title:f.get('title').trim(),
        platform:f.get('platform'),
        genre:f.get('genre'),
        description:f.get('description').trim(),
        status:'На розгляді',
        createdAt:new Date().toISOString().slice(0,
        10)
    }
);
save();
toast('Пропозицію надіслано адміністратору.');
profile()
}
)
}
function adminPage(tab='proposals'){
    rerender=()=>adminPage(tab);
    const u=me();
    // The role comes from GET /api/Profile; the backend enforces it on every admin endpoint anyway.
    if(!u||!u.isAdmin)
    {
        toast('Цей розділ доступний лише адміністратору.');
        go('discover');
        return
    }
const pending=db.proposals.filter(p=>p.status==='На розгляді').length;
let body='';
if(tab==='proposals'){
    body=`
            <div class="table-wrap">
            <table>
            <thead>
            <tr>
            <th>Гра
            </th>
            <th>Користувач
            </th>
            <th>Платформа · Жанр
            </th>
            <th>Опис / посилання
            </th>
            <th>Статус
            </th>
            <th>Дії
            </th>
            </tr>
            </thead>
            <tbody>${db.proposals.map(p=>{const owner={name:p.userName};return `
            <tr>
            <td>
            <b>${esc(p.title)}
            </b>
            <div class="small muted">${esc(p.createdAt)}
            </div>
            </td>
            <td>${esc(owner?.name||'Користувач')}
            </td>
            <td>${esc(p.platform)} · ${esc(p.genre)}
            </td>
            <td>${esc(p.description||'—')}
            </td>
            <td>
            <span class="status ${p.status==='Схвалено'?'approved':p.status==='Відхилено'?'rejected':'pending'}">${esc(p.status)}
            </span>
            </td>
            <td>
            <div class="row-actions">${p.status!=='Схвалено'?`
            <button class="btn primary" data-approve="${p.id}">Схвалити
            </button>`:''}${p.status!=='Відхилено'?`
            <button class="btn danger" data-reject="${p.id}">Відхилити
            </button>`:''}${p.status==='Схвалено'?`
            <button class="btn" data-publish="${p.id}">Додати в локальний каталог
            </button>`:''}
            </div>
            </td>
            </tr>`}).join('')||'<tr><td colspan="6">Пропозицій поки немає.</td></tr>'}
            </tbody>
            </table>
            </div>`
}
else if(tab==='games'){
    body=`
            <div class="section-head">
            <div>
            <h2>Локальний demo-каталог
            </h2>
            <p class="muted small">Ці ігри зберігаються лише в цьому браузері й не потрапляють у каталог GameNest на сервері.
            </p>
            </div>
            <button class="btn primary" data-go="addgame">＋ Додати гру
            </button>
            </div>
            <div class="table-wrap">
            <table>
            <thead>
            <tr>
            <th>Назва
            </th>
            <th>Розробник
            </th>
            <th>Платформа
            </th>
            <th>Жанр
            </th>
            <th>Дії
            </th>
            </tr>
            </thead>
            <tbody>${db.games.map(g=>`
            <tr>
            <td>
            <b>${esc(g.title)}
            </b>
            </td>
            <td>${esc(g.developer)}
            </td>
            <td>${esc(g.platform)}
            </td>
            <td>${esc(g.genre)}
            </td>
            <td>
            <div class="row-actions">
            <button class="btn danger" data-deletegame="${g.id}">Видалити
            </button>
            </div>
            </td>
            </tr>`).join('')}
            </tbody>
            </table>
            </div>`
}
else{
    body=`
            <section class="panel">
            <h2>Додати гру до локального demo-каталогу
            </h2>
            <p class="muted small">Гра збережеться лише в цьому браузері. У каталог GameNest на сервері вона не потрапить.
            </p>${gameForm()}
            </section>`
}
layout(`
            <main class="container">
            <div class="eyebrow">Панель керування
            </div>
            <h1 style="font-size:36px">Адміністрування GameNest
            </h1>
            <p class="muted">Керуй іграми каталогу та модеруй пропозиції користувачів.
            </p>
            ${localNotice()}
            <div class="stat-grid" style="margin:24px 0">
            <div class="stat">
            <span class="muted small">Ігор у локальному каталозі
            </span>
            <strong>${db.games.length}
            </strong>
            </div>
            <div class="stat">
            <span class="muted small">Усі пропозиції
            </span>
            <strong>${db.proposals.length}
            </strong>
            </div>
            <div class="stat">
            <span class="muted small">Очікують розгляду
            </span>
            <strong>${pending}
            </strong>
            </div>
            </div>
            <div class="admin-tabs">
            <button class="chip ${tab==='proposals'?'active':''}" data-admintab="proposals">Пропозиції (${pending})
            </button>
            <button class="chip ${tab==='games'?'active':''}" data-admintab="games">Локальний каталог
            </button>
            <button class="chip ${tab==='add'?'active':''}" data-admintab="add">＋ Додати гру
            </button>
            </div>${body}
            </main>`,
'admin');
bind();
if(tab==='add')bindGameForm()
}
function gameForm(){
    return `
            <form id="gameForm" class="form-grid">
            <div class="field">
            <label>Назва гри *
            </label>
            <input name="title" required placeholder="Назва гри">
            </div>
            <div class="field">
            <label>Розробник
            </label>
            <input name="developer" placeholder="Студія / компанія">
            </div>
            <div class="field">
            <label>Видавець
            </label>
            <input name="publisher" placeholder="Видавець">
            </div>
            <div class="field">
            <label>Жанр *
            </label>
            <select name="genre" required>${['RPG','Action','Пригоди','Horror','Survival','Симулятор','Strategy','Indie','Інший'].map(x=>`
            <option>${x}
            </option>`).join('')}
            </select>
            </div>
            <div class="field">
            <label>Платформа *
            </label>
            <select name="platform" required>${['PC','PlayStation','Xbox','Nintendo Switch','Mobile','Інша'].map(x=>`
            <option>${x}
            </option>`).join('')}
            </select>
            </div>
            <div class="field">
            <label>Рік релізу
            </label>
            <input name="year" type="number" min="1970" max="2100" value="${new Date().getFullYear()}">
            </div>
            <div class="field wide">
            <label>Опис
            </label>
            <textarea name="description" placeholder="Короткий опис гри">
            </textarea>
            </div>
            <div class="field">
            <label>Стиль постера
            </label>
            <select name="poster">
            <option value="p1">Лісовий
            </option>
            <option value="p2">Теплий
            </option>
            <option value="p3">Холодний
            </option>
            <option value="p4">Нічний
            </option>
            <option value="p5">Нейтральний
            </option>
            <option value="p6">Зелений
            </option>
            </select>
            </div>
            <div class="wide">
            <button class="btn primary">Додати гру до каталогу
            </button>
            </div>
            </form>`
}
function bindGameForm(){
    const f=$('#gameForm');
    if(!f)return;
    f.addEventListener
    ('submit',
    e=>{
        e.preventDefault();
        const d=new FormData(f);
        const title=d.get('title').trim();
        if(db.games.some(g=>g.title.toLowerCase()===title.toLowerCase())){
            toast('Гра з такою назвою вже є в локальному каталозі.');
            return
        }
    db.games.unshift({
        id:'g'+Date.now(),
        title,
        developer:d.get('developer').trim()||'Невідомий розробник',
        publisher:d.get('publisher').trim()||'—',
        genre:d.get('genre'),
        platform:d.get('platform'),
        year:Number(d.get('year'))||new Date().getFullYear(),
        description:d.get('description').trim(),
        poster:d.get('poster')
    }
);
save();
toast('Гру додано до локального demo-каталогу.');
adminPage('games')
}
)
}
function detail(id){
    rerender=()=>detail(id);
    const g=gameById(id);
    if(!g){
        go('discover');
        return
    }
const st=library()[id];
layout(`
            <main class="container">
            <button class="btn" data-go="library">← До бібліотеки
            </button>
            <div class="detail-layout" style="margin-top:22px">
            <section>
            <div class="detail-poster">${poster(g)}
            </div>
            <div class="section-head">
            <div>
            <div class="eyebrow">${esc(g.genre)} · ${esc(g.platform)} · ${esc(g.year)}
            </div>
            <h1 style="font-size:38px">${esc(g.title)}
            </h1>
            <p class="muted">${esc(g.developer)}${g.publisher?' · '+esc(g.publisher):''}
            </p>
            </div>${st?`
            <span class="status ${statusClass(st)}">${esc(st)}
            </span>`:''}
            </div>
            <h3>Про гру
            </h3>
            <p style="line-height:1.8;color:#6e655f">${esc(g.description||'Опис цієї гри ще не додано.')}
            </p>
            <div class="notice">Це локальна demo-гра з цього браузера, її немає в каталозі GameNest на сервері.
            </div>
            <div class="notice">Статус гри змінюється вручну. GameNest не відстежує автоматично прогрес або відсоток проходження.
            </div>
            </section>
            <aside class="panel">
            <h3>Моя бібліотека
            </h3>
            <p class="muted small">${st?'Гра вже є у твоїй бібліотеці.':'Додай гру та обери її поточний статус.'}
            </p>
            <div class="field">
            <label>Статус гри
            </label>
            <select id="detailStatus">${STATUSES.map(s=>`
            <option ${st===s?'selected':''}>${s}
            </option>`).join('')}
            </select>
            </div>
            <button class="btn primary" style="width:100%;margin-top:14px" data-save-status="${g.id}">${st?'Зберегти статус':'Додати до бібліотеки'}
            </button>${me()?.isAdmin?`
            <hr class="divider">
            <button class="btn" style="width:100%" data-go="admin">Відкрити адмінпанель
            </button>`:''}
            </aside>
            </div>
            </main>`,
'discover')
}
function addStatus(id){
    const u=me();
    if(!u){
        toast
        ('Увійди, щоб додати гру до бібліотеки.');
        auth();
        return
    }
const val=$('#detailStatus')?.value||'Куплена';
library()[id]=val;
save();
toast('Статус гри збережено.');
detail(id)
}
// Profile data shown as stored on the server (GET /api/Profile). Editing comes with the profile integration;
// a local-only edit would show a name the server does not know.
function settings(){
    rerender=()=>settings();
    const u=me();
    if(!u){
        auth();
        return
    }
layout(`
            <main class="container">
            <button class="btn" data-go="profile">← До кабінету
            </button>
            <div class="section-head">
            <div>
            <div class="eyebrow">Профіль
            </div>
            <h1 style="font-size:36px">Налаштування
            </h1>
            <p class="muted">Дані облікового запису GameNest.
            </p>
            </div>
            </div>
            <section class="panel" style="max-width:650px">
            <div class="form-grid">
            <div class="field wide">
            <label for="profileUsername">Ім’я користувача
            </label>
            <input id="profileUsername" value="${esc(u.username)}" disabled>
            </div>
            <div class="field wide">
            <label for="profileEmail">Електронна пошта
            </label>
            <input id="profileEmail" value="${esc(u.email)}" disabled>
            </div>
            <div class="field wide">
            <label for="profileRole">Роль
            </label>
            <input id="profileRole" value="${u.isAdmin?'Адміністратор':'Користувач'}" disabled>
            </div>
            <div class="wide notice">Зміна імені з’явиться в наступному оновленні.
            </div>
            </div>
            </section>
            </main>`,
'profile');
}
function go(page,
arg){
    if(page==='discover')discover();
    else if(page==='auth')auth();
    else if(page==='library')libraryPage();
    else if(page==='profile')profile();
    else if(page==='admin')adminPage();
    else if(page==='addgame')adminPage('add');
    else if(page==='settings')settings();
    else if(page==='detail')detail(arg)
    else if(page==='game')apiDetail(arg)
}
function bind(){
    $$('[data-go]').forEach(b=>b.addEventListener('click',
    e=>{
        e.preventDefault();
        go(b.dataset.go)
    }
));
$$('[data-action="logout"]').forEach(b=>b.addEventListener('click',
()=>{
    session.signOut();
    toast('Ти вийшов з акаунта.');
    discover()
}
));
$$('[data-action="retry-profile"]').forEach(b=>b.addEventListener('click',
()=>session.reloadProfile()));
$$('[data-game]').forEach(b=>b.addEventListener('click',
()=>detail(b.dataset.game)));
// API catalog games (numeric ids) — never resolved through the local gameById().
// Elements inside #gameGrid are handled by bindCatalogGrid() (delegation), not here.
$$('[data-api-game]').filter(b=>!b.closest('#gameGrid')).forEach(b=>b.addEventListener('click',
()=>openApiGame(b)));
$$('img[data-cover]').filter(img=>!img.closest('#gameGrid')).forEach(img=>img.addEventListener('error',
()=>onCoverError(img),{once:true}));
$$('[data-add]').forEach(b=>b.addEventListener('click',
()=>{
    if(!me()){
        auth();
        toast('Увійди, щоб додати гру.');
        return
    }
const id=b.dataset.add;
library()[id]='Куплена';
save();
toast('Гру додано зі статусом «Куплена».');
discover()
}
));
$$('[data-status]').forEach(b=>b.addEventListener('click',
()=>{
    if(!me()){
        auth();
        return
    }
detail(b.dataset.status)
}
));
$$('[data-save-status]').forEach(b=>b.addEventListener('click',
()=>addStatus(b.dataset.saveStatus)));
$$('[data-scroll]').forEach(b=>b.addEventListener('click',
()=>document.getElementById(b.dataset.scroll)?.scrollIntoView({
    behavior:'smooth'
}
)));
$$('[data-admintab]').forEach(b=>b.addEventListener('click',
()=>adminPage(b.dataset.admintab)));
$$('[data-approve]').forEach(b=>b.addEventListener('click',
()=>{
    const p=db.proposals.find(p=>p.id===b.dataset.approve);
    if(p){
        p.status='Схвалено';
        save();
        toast('Пропозицію схвалено.');
        adminPage('proposals')
    }
}
));
$$('[data-reject]').forEach(b=>b.addEventListener('click',
()=>{
    const p=db.proposals.find(p=>p.id===b.dataset.reject);
    if(p){
        p.status='Відхилено';
        save();
        toast('Пропозицію відхилено.');
        adminPage('proposals')
    }
}
));
$$('[data-publish]').forEach(b=>b.addEventListener('click',
()=>{
    const p=db.proposals.find(p=>p.id===b.dataset.publish);
    if(!p)return;
    if(db.games.some(g=>g.title.toLowerCase()===p.title.toLowerCase())){
        toast('Така гра вже є в локальному каталозі.');
        return
    }
db.games.unshift({
    id:'g'+Date.now(),
    title:p.title,
    developer:'—',
    publisher:'—',
    genre:p.genre,
    platform:p.platform,
    year:new Date().getFullYear(),
    description:p.description,
    poster:'p2'
}
);
p.published=true;
save();
toast('Гру додано до локального demo-каталогу.');
adminPage('games')
}
));
$$('[data-deletegame]').forEach(b=>b.addEventListener('click',
()=>{
    const g=gameById(b.dataset.deletegame);
    if(g&&confirm(`Видалити «${g.title}» з каталогу?`)){
        db.games=db.games.filter(x=>x.id!==g.id);
        save();
        adminPage('games');
        toast('Гру видалено.')
    }
}
))
}
if(!Array.isArray(db.games)){
    db=fresh();
    save()
}
// Every session change (sign-in, profile loaded, 401, sign-out) re-renders the current page;
// pages that need a user fall back to the sign-in page by themselves.
let lastStatus=session.state.status;
session.subscribe(st=>{
    if(lastStatus==='authenticated'&&st.status==='anonymous'&&st.error)toast(st.error);
    lastStatus=st.status;
    rerender()
});
// The catalog loads asynchronously; refresh the catalog page (only) when its state changes.
window.GameNestCatalog.subscribe(()=>{
    if($('main[data-page="discover"]'))discover()
});
discover();
if(session.hasToken())session.restore();
}
)();
