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
            <p>Ігри з’являться тут, щойно адміністратор додасть їх до каталогу GameNest. Знаєш гру, якої тут бракує?
            </p>
            <button class="btn primary" data-go="submit">Запропонувати гру
            </button>
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
            <div class="row-actions">
            <span class="status" id="catalogCount">${catalogCount()}
            </span>
            <button class="btn primary" data-go="submit">＋ Запропонувати гру
            </button>
            </div>
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
// ---------- Game submissions and moderation (API: GameNestSubmissions) ----------
// Every page assigns `rerender`; a response may only render while its page is still the current one.
function beginView(view){
    rerender=view;
    return ()=>rerender===view
}
const dateTimeFormat=new Intl.DateTimeFormat('uk-UA',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
const fmtDateTime=d=>d?dateTimeFormat.format(d):'—';
const fmtDate=d=>d?releaseDateFormat.format(d):'';
// Page to open after signing in (e.g. the submission form).
let afterSignIn=null;
// Returns the signed-in user, or renders the right state (checking the session / sign-in prompt) and returns null.
function requireSignedIn(route,message){
    const u=me();
    if(u)return u;
    if(session.state.status==='loading'){
        layout(`
            <main class="container">
            <div class="empty" role="status" aria-busy="true">
            <h3>Перевіряємо вхід…
            </h3>
            </div>
            </main>`,'');
        return null
    }
    afterSignIn=route;
    toast(message||'Увійди, щоб продовжити.');
    auth();
    return null
}
function submissionStatus(s){
    return `<span class="status ${esc(s.statusCss)}">${esc(s.statusLabel)}</span>`
}
function loadingBlock(text){
    return `
            <div class="empty" role="status" aria-live="polite" aria-busy="true">
            <h3>${esc(text)}
            </h3>
            </div>`
}
function errorBlock(title,error,retryAction){
    return `
            <div class="empty" role="alert">
            <h3>${esc(title)}
            </h3>
            <p>${esc(error||'Спробуй ще раз трохи пізніше.')}
            </p>${retryAction?`
            <button class="btn primary" data-action="${esc(retryAction)}">Спробувати ще раз
            </button>`:''}
            </div>`
}
// Shared form for proposing a game and for adding one directly (admin). Only fields the backend supports.
function gameFieldsForm(id,submitLabel){
    const L=window.GameNestSubmissions.LIMITS;
    const field=(name,label,input,wide)=>`
            <div class="field${wide?' wide':''}" data-field="${name}">
            <label for="${id}-${name}">${label}
            </label>${input}
            <div class="field-error small" id="${id}-${name}-error" aria-live="polite">
            </div>
            </div>`;
    return `
            <form id="${id}" class="form-grid" novalidate>${field('title','Назва гри *',`
            <input id="${id}-title" name="title" required maxlength="${L.title}" autocomplete="off" placeholder="Наприклад, Hollow Knight: Silksong">`)}${field('releaseDate','Дата виходу',`
            <input id="${id}-releaseDate" name="releaseDate" type="date" min="${L.minYear}-01-01">`)}${field('developer','Розробник',`
            <input id="${id}-developer" name="developer" maxlength="${L.name}" autocomplete="off">`)}${field('publisher','Видавець',`
            <input id="${id}-publisher" name="publisher" maxlength="${L.name}" autocomplete="off">`)}${field('coverUrl','Обкладинка (URL)',`
            <input id="${id}-coverUrl" name="coverUrl" type="url" inputmode="url" maxlength="${L.url}" placeholder="https://…">`)}${field('trailerUrl','Трейлер (URL)',`
            <input id="${id}-trailerUrl" name="trailerUrl" type="url" inputmode="url" maxlength="${L.url}" placeholder="https://…">`)}${field('description','Опис',`
            <textarea id="${id}-description" name="description" rows="5" maxlength="${L.description}"></textarea>`,true)}
            <div class="wide form-status small" id="${id}-status" role="status" aria-live="polite">
            </div>
            <div class="wide">
            <button class="btn primary" type="submit" id="${id}-submit">${esc(submitLabel)}
            </button>
            </div>
            </form>`
}
// Validation, busy state (no double submissions) and server errors for a gameFieldsForm.
// The request is never cancelled (the server may already be processing it). When it settles:
//   afterSuccess(result) — data effects (e.g. catalog refresh), always;
//   successMessage / failureMessage — a short toast, always (it does not change the page);
//   onSuccess(result,values) and error details in the form — only if this form is still on screen, so a late
//   response cannot change or navigate away from a page the user has opened since.
function bindGameFieldsForm(form,{submitLabel,busyLabel,send,successMessage,failureMessage,afterSuccess,onSuccess}){
    const S=window.GameNestSubmissions;
    const button=form.querySelector('[type="submit"]');
    const status=form.querySelector('.form-status');
    let busy=false;
    const showErrors=errors=>{
        form.querySelectorAll('[data-field]').forEach(el=>{
            const msg=errors[el.dataset.field]||'';
            el.classList.toggle('invalid',!!msg);
            el.querySelector('.field-error').textContent=msg;
            el.querySelector('input,textarea')?.setAttribute('aria-invalid',msg?'true':'false')
        })
    };
    form.addEventListener('submit',async e=>{
        e.preventDefault();
        if(busy)return;
        const values=S.readForm(form);
        const errors=S.validate(values);
        showErrors(errors);
        status.textContent='';
        const first=Object.keys(errors)[0];
        if(first){
            form.querySelector(`[name="${first}"]`)?.focus();
            return
        }
        busy=true;
        button.disabled=true;
        button.textContent=busyLabel;
        form.setAttribute('aria-busy','true');
        let result;
        try{
            result=await send(values)
        }catch(error){
            const message=window.GameNestApi.describeError(error);
            if(!form.isConnected){
                toast(failureMessage?`${failureMessage}: ${message}`:message);
                return
            }
            showErrors(S.fieldErrors(error));
            status.textContent=message;
            toast(message);
            return
        }finally{
            busy=false;
            if(form.isConnected){
                button.disabled=false;
                button.textContent=submitLabel;
                form.removeAttribute('aria-busy')
            }
        }
        // The request has succeeded; a failing data effect (sync throw or rejected promise) must not hide that
        // from the user or stop onSuccess — it is only logged (the catalog shows its own error state).
        try{
            const pending=afterSuccess?.(result);
            if(pending&&typeof pending.then==='function')pending.then(undefined,error=>console.warn('afterSuccess failed:',error));
        }catch(error){
            console.warn('afterSuccess failed:',error)
        }
        if(successMessage)toast(successMessage);
        if(form.isConnected)onSuccess?.(result,values)
    })
}
// User: propose a game.
function submitGame(){
    beginView(()=>submitGame());
    const u=requireSignedIn('submit','Увійди, щоб запропонувати гру.');
    if(!u)return;
    layout(`
            <main class="container" data-page="submit">
            <button class="btn" data-go="discover">← До каталогу
            </button>
            <div class="section-head" style="margin-top:18px">
            <div>
            <div class="eyebrow">Каталог GameNest
            </div>
            <h1 style="font-size:36px">Запропонувати гру
            </h1>
            <p class="muted">Не знайшов гру в каталозі? Заповни форму — адміністратор розгляне пропозицію, і після схвалення гра з’явиться в каталозі.
            </p>
            </div>
            <button class="btn" data-go="submissions">Мої пропозиції
            </button>
            </div>
            <section class="panel">${gameFieldsForm('submissionForm','Надіслати на розгляд')}
            </section>
            </main>`,'discover');
    bindGameFieldsForm($('#submissionForm'),{
        submitLabel:'Надіслати на розгляд',
        busyLabel:'Надсилаємо…',
        send:values=>window.GameNestSubmissions.submit(values),
        successMessage:'Пропозицію надіслано на розгляд.',
        failureMessage:'Пропозицію не надіслано',
        onSuccess:()=>mySubmissions()
    })
}
// User: own submissions (GET /api/Submissions/mine).
function mySubmissions(){
    const isCurrent=beginView(()=>mySubmissions());
    const u=requireSignedIn('submissions','Увійди, щоб переглянути свої пропозиції.');
    if(!u)return;
    const render=body=>layout(`
            <main class="container" data-page="submissions">
            <div class="section-head">
            <div>
            <div class="eyebrow">Каталог GameNest
            </div>
            <h1 style="font-size:36px">Мої пропозиції
            </h1>
            <p class="muted">Статус змінюється після перевірки адміністратором.
            </p>
            </div>
            <button class="btn primary" data-go="submit">＋ Запропонувати гру
            </button>
            </div>${body}
            </main>`,'profile');
    render(loadingBlock('Завантажуємо пропозиції…'));
    window.GameNestSubmissions.mine().then(items=>{
        if(!isCurrent())return;
        render(items.length?`
            <div class="submission-list">${items.map(s=>`
            <article class="panel submission-item">
            <div class="submission-head">
            <div>
            <h3>${esc(s.title)}
            </h3>
            <div class="small muted">Подано ${esc(fmtDateTime(s.createdAt))} · ${esc(s.typeLabel)}
            </div>
            </div>${submissionStatus(s)}
            </div>${s.status==='Rejected'?`
            <p class="small"><b>Причина відхилення:</b> ${esc(s.adminComment||'не вказано')}
            </p>`:''}${s.status==='Approved'&&s.gameId?`
            <button class="btn" data-api-game="${esc(s.gameId)}">Переглянути в каталозі
            </button>`:''}
            </article>`).join('')}
            </div>`:`
            <div class="empty">
            <h3>Пропозицій поки немає
            </h3>
            <p>Запропонуй гру, якої ще немає в каталозі.
            </p>
            <button class="btn primary" data-go="submit">Запропонувати гру
            </button>
            </div>`)
    }).catch(error=>{
        if(!isCurrent())return;
        render(errorBlock('Не вдалося завантажити пропозиції',window.GameNestApi.describeError(error),'submissions-retry'))
    })
}
// Admin pages: the role comes from GET /api/Profile; the backend enforces it on every endpoint anyway.
function requireAdmin(){
    const u=requireSignedIn('admin','Увійди як адміністратор.');
    if(!u)return null;
    if(!u.isAdmin){
        toast('Цей розділ доступний лише адміністратору.');
        go('discover');
        return null
    }
    return u
}
// Admin tab bar: real moderation (API) separated from the local demo tools.
function adminTabs(tab){
    const chip=(key,label)=>`<button class="chip ${tab===key?'active':''}" data-admintab="${key}">${label}</button>`;
    return `
            <div class="admin-tabs" aria-label="Каталог GameNest">${chip('moderation','Модерація пропозицій')}${chip('create','＋ Додати гру в каталог')}
            </div>
            <div class="admin-tabs demo-tabs" aria-label="Демо: лише цей браузер">
            <span class="small muted">Демо (лише цей браузер):
            </span>${chip('proposals','Локальні пропозиції')}${chip('games','Локальний каталог')}${chip('add','＋ Локальна гра')}
            </div>`
}
function adminShell(tab,body){
    layout(`
            <main class="container" data-page="admin-${esc(tab)}">
            <div class="eyebrow">Панель керування
            </div>
            <h1 style="font-size:36px">Адміністрування GameNest
            </h1>
            <p class="muted">Модеруй пропозиції користувачів і додавай ігри до каталогу GameNest. Зміни одразу потрапляють на сервер.
            </p>${adminTabs(tab)}${body}
            </main>`,'admin')
}
const MODERATION_FILTERS=[['Pending','На розгляді'],['Approved','Схвалені'],['Rejected','Відхилені'],['','Усі']];
let moderationFilter='Pending';
// Admin: moderation queue (GET /api/Submissions?status=…).
function adminModeration(){
    const isCurrent=beginView(()=>adminModeration());
    if(!requireAdmin())return;
    const filter=moderationFilter;
    const render=body=>adminShell('moderation',`
            <div class="toolbar filters" style="margin-top:18px">${MODERATION_FILTERS.map(([v,l])=>`
            <button class="chip ${v===filter?'active':''}" data-modfilter="${v}">${l}
            </button>`).join('')}
            </div>${body}`);
    render(loadingBlock('Завантажуємо пропозиції…'));
    window.GameNestSubmissions.adminList(filter).then(items=>{
        if(!isCurrent())return;
        render(items.length?`
            <div class="submission-list">${items.map(s=>`
            <article class="panel submission-item">
            <div class="submission-head">
            <div>
            <h3>${esc(s.title)}
            </h3>
            <div class="small muted">${esc(s.submittedBy||'Користувач #'+s.submittedByUserId)} · ${esc(fmtDateTime(s.createdAt))} · ${esc(s.typeLabel)}
            </div>
            </div>${submissionStatus(s)}
            </div>
            <button class="btn" data-submission="${esc(s.id)}">${s.status==='Pending'?'Розглянути':'Переглянути'}
            </button>
            </article>`).join('')}
            </div>`:`
            <div class="empty">
            <h3>${filter==='Pending'?'Немає пропозицій на розгляді':'Пропозицій не знайдено'}
            </h3>
            </div>`)
    }).catch(error=>{
        if(!isCurrent())return;
        render(errorBlock('Не вдалося завантажити пропозиції',window.GameNestApi.describeError(error),'moderation-retry'))
    })
}
// Admin: one submission with all submitted data, approve / reject.
function adminSubmission(id){
    const isCurrent=beginView(()=>adminSubmission(id));
    if(!requireAdmin())return;
    const back=`
            <button class="btn" data-admintab="moderation">← До черги модерації
            </button>`;
    const render=body=>adminShell('moderation',`
            <div style="margin-top:18px">${back}
            </div>${body}`);
    render(loadingBlock('Завантажуємо пропозицію…'));
    window.GameNestSubmissions.get(id).then(s=>{
        if(!isCurrent())return;
        if(!s){
            render(errorBlock('Не вдалося прочитати пропозицію','Сервер повернув некоректні дані.'));
            return
        }
        renderAdminSubmission(s,render,isCurrent)
    }).catch(error=>{
        if(!isCurrent())return;
        if(error.status===404){
            render(errorBlock('Пропозицію не знайдено','Можливо, її видалив автор.'));
            return
        }
        render(errorBlock('Не вдалося завантажити пропозицію',window.GameNestApi.describeError(error),'submission-retry'))
    })
}
function renderAdminSubmission(s,render,isCurrent){
    const cs=window.GameNestCatalog.state;
    const sameTitle=cs.status==='success'&&cs.games.some(g=>g.title.toLocaleLowerCase('uk')===s.title.toLocaleLowerCase('uk'));
    const urlRow=(label,safe,raw)=>raw?`
            <div class="field">
            <label>${label}
            </label>
            <div>${safe?`<a href="${esc(safe)}" target="_blank" rel="noopener noreferrer">${esc(safe)}</a>`:`<span class="muted">некоректна адреса, не показано</span>`}
            </div>
            </div>`:'';
    const facts=[['Розробник',s.developer],['Видавець',s.publisher],['Дата виходу',fmtDate(s.releaseDate)],['Автор',s.submittedBy||'Користувач #'+s.submittedByUserId],['Подано',fmtDateTime(s.createdAt)],['Тип',s.typeLabel]].filter(([,v])=>v);
    render(`
            <div class="detail-layout" style="margin-top:18px">
            <section>
            <div class="detail-poster">${apiPoster({id:s.id,title:s.title,coverUrl:s.coverUrl})}
            </div>
            <div class="section-head">
            <div>
            <h2 style="font-size:30px">${esc(s.title)}
            </h2>
            </div>${submissionStatus(s)}
            </div>${sameTitle&&s.status==='Pending'?`
            <div class="notice" role="note">У каталозі вже є гра з такою назвою. Схвалення додасть ще одну гру (версію) з цією назвою.
            </div>`:''}
            <h3>Опис
            </h3>
            <p style="line-height:1.8;color:#6e655f;white-space:pre-line">${esc(s.description||'Опис не вказано.')}
            </p>
            </section>
            <aside class="panel">${facts.map(([k,v])=>`
            <div class="field">
            <label>${esc(k)}
            </label>
            <div>${esc(v)}
            </div>
            </div>`).join('')}${urlRow('Обкладинка',s.coverUrl,s.rawCoverUrl)}${urlRow('Трейлер',s.trailerUrl,s.rawTrailerUrl)}
            <hr class="divider">${s.status==='Pending'?`
            <div class="field">
            <label for="rejectReason">Причина відхилення (необов’язково)
            </label>
            <textarea id="rejectReason" rows="3" maxlength="${window.GameNestSubmissions.LIMITS.reason}" placeholder="Її побачить автор пропозиції"></textarea>
            </div>
            <div class="row-actions" style="margin-top:12px">
            <button class="btn primary" id="approveSubmission">Схвалити й додати в каталог
            </button>
            <button class="btn danger" id="rejectSubmission">Відхилити
            </button>
            </div>
            <div class="form-status small" id="moderationStatus" role="status" aria-live="polite">
            </div>`:`
            <p class="small muted">Розглянуто ${esc(fmtDateTime(s.reviewedAt))}.
            </p>${s.status==='Rejected'?`
            <p class="small"><b>Причина:</b> ${esc(s.adminComment||'не вказано')}
            </p>`:''}${s.status==='Approved'&&s.gameId?`
            <button class="btn" data-api-game="${esc(s.gameId)}">Переглянути гру в каталозі
            </button>`:''}`}
            </aside>
            </div>`);
    if(s.status!=='Pending')return;
    const approveBtn=$('#approveSubmission'),rejectBtn=$('#rejectSubmission'),status=$('#moderationStatus');
    const act=async(kind)=>{
        if(approveBtn.disabled)return;
        approveBtn.disabled=rejectBtn.disabled=true;
        status.textContent=kind==='approve'?'Схвалюємо…':'Відхиляємо…';
        try{
            const updated=kind==='approve'
                ?await window.GameNestSubmissions.approve(s.id)
                :await window.GameNestSubmissions.reject(s.id,$('#rejectReason')?.value);
            if(kind==='approve')window.GameNestCatalog.load({force:true});
            toast(kind==='approve'?'Пропозицію схвалено, гру додано до каталогу.':'Пропозицію відхилено.');
            if(isCurrent()&&updated)renderAdminSubmission(updated,render,isCurrent)
        }catch(error){
            if(!isCurrent())return;
            if(error.status===409&&error.code==='submission_already_reviewed'){
                toast('Цю пропозицію вже розглянули.');
                adminSubmission(s.id);
                return
            }
            status.textContent=window.GameNestApi.describeError(error);
            approveBtn.disabled=rejectBtn.disabled=false
        }
    };
    approveBtn.addEventListener('click',()=>act('approve'));
    rejectBtn.addEventListener('click',()=>act('reject'))
}
// Admin: add a game to the public catalog directly (POST /api/Games), no submission involved.
function adminCreateGame(){
    beginView(()=>adminCreateGame());
    if(!requireAdmin())return;
    adminShell('create',`
            <section class="panel" style="margin-top:18px">
            <h2>Додати гру до каталогу GameNest
            </h2>
            <p class="muted small">Гра одразу з’явиться в публічному каталозі — без пропозиції та модерації.
            </p>${gameFieldsForm('adminGameForm','Додати до каталогу')}
            <div id="createdGame">
            </div>
            </section>`);
    const form=$('#adminGameForm');
    bindGameFieldsForm(form,{
        submitLabel:'Додати до каталогу',
        busyLabel:'Додаємо…',
        send:values=>window.GameNestSubmissions.createGame(values),
        successMessage:'Гру додано до каталогу.',
        failureMessage:'Гру не додано',
        afterSuccess:()=>window.GameNestCatalog.load({force:true}),
        onSuccess:game=>{
            form.reset();
            const created=$('#createdGame');
            if(created&&game&&Number.isInteger(game.id)){
                created.innerHTML=`
            <div class="notice" role="status">Додано: <b>${esc(game.title)}</b>
            <button class="btn" data-api-game="${esc(game.id)}" style="margin-left:8px">Відкрити в каталозі
            </button>
            </div>`;
                created.querySelector('[data-api-game]').addEventListener('click',e=>openApiGame(e.currentTarget))
            }
        }
    })
}
function auth(){
    rerender=()=>auth();
    const st=session.state;
    if(me()){
        const next=afterSignIn||'discover';
        afterSignIn=null;
        go(next);
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
            const next=afterSignIn||'discover';
            afterSignIn=null;
            go(next)
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
            <h2>Пропозиції ігор
            </h2>
            <p class="muted small">Не знайшов гру в каталозі? Запропонуй її — адміністратор розгляне пропозицію.
            </p>
            </div>
            </div>
            <section class="panel row-actions">
            <button class="btn primary" data-go="submit">＋ Запропонувати гру
            </button>
            <button class="btn" data-go="submissions">Мої пропозиції
            </button>
            </section>
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
}
function profile(){
    rerender=()=>profile();
    const u=me();
    if(!u){
        auth();
        return
    }
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
            <button data-go="submissions">☆ Мої пропозиції
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
            </div>
            <div class="section-head">
            <div>
            <h2>Пропозиції ігор
            </h2>
            <p class="muted small">Запропонуй гру, якої ще немає в каталозі GameNest, і стеж за статусом розгляду.
            </p>
            </div>
            </div>
            <section class="panel row-actions">
            <button class="btn primary" data-go="submit">＋ Запропонувати гру
            </button>
            <button class="btn" data-go="submissions">Мої пропозиції
            </button>
            </section>
            </section>
            </div>
            </main>`,
'profile');
}
function adminPage(tab='moderation'){
    rerender=()=>adminPage(tab);
    const u=me();
    // The role comes from GET /api/Profile; the backend enforces it on every admin endpoint anyway.
    if(!u||!u.isAdmin)
    {
        toast('Цей розділ доступний лише адміністратору.');
        go('discover');
        return
    }
// Real (API) admin tabs; the remaining tabs are the local demo tools.
if(tab==='moderation'){adminModeration();return}
if(tab==='create'){adminCreateGame();return}
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
            <p class="muted">Демо-інструменти: локальні пропозиції та локальний каталог із цього браузера. На сервер GameNest вони не впливають.
            </p>${adminTabs(tab)}
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
${body}
            </main>`,
'admin');
// layout() has already called bind(); calling it again attached every handler twice.
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
    else if(page==='submit')submitGame();
    else if(page==='submissions')mySubmissions();
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
// Submissions and moderation (API).
$$('[data-submission]').forEach(b=>b.addEventListener('click',
()=>{
    const id=Number(b.dataset.submission);
    if(Number.isInteger(id)&&id>0)adminSubmission(id)
}));
$$('[data-modfilter]').forEach(b=>b.addEventListener('click',
()=>{
    moderationFilter=b.dataset.modfilter;
    adminModeration()
}));
$$('[data-action="submissions-retry"]').forEach(b=>b.addEventListener('click',()=>mySubmissions()));
$$('[data-action="moderation-retry"]').forEach(b=>b.addEventListener('click',()=>adminModeration()));
$$('[data-action="submission-retry"]').forEach(b=>b.addEventListener('click',()=>rerender()));
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
