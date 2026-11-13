(() => {
    const $ = (s, root = document) => root.querySelector(s);
    const $$ = (s, root = document) => [...root.querySelectorAll(s)];
    const api = window.GameNestApi;
    const session = window.GameNestSession;
    const Catalog = window.GameNestCatalog;
    const Library = window.GameNestLibrary;
    const UserGames = window.GameNestUserGames;
    const Profile = window.GameNestProfile;
    const Submissions = window.GameNestSubmissions;
    // All data comes from the GameNest API. Nothing is stored in localStorage; the JWT lives in sessionStorage (session.js).
    let rerender = () => discover();

function esc(v=''){
    return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
}
// Signed-in user from GET /api/Profile ({ id, username, email, role, emailConfirmed, isAdmin }), or null.
function me(){
    return session.isAuthenticated?session.user:null
}
function toast(msg){
    const el=$('#toast');
    el.textContent=msg;
    el.classList.add('show');
    clearTimeout(toast.t);
    toast.t=setTimeout(()=>el.classList.remove('show'),2800)
}
// Text for an error: a string as is, an ApiError via the API client, a stored {status, message} by its message.
const describe=error=>typeof error==='string'?error
    :error instanceof api.ApiError?api.describeError(error)
    :error&&typeof error.message==='string'?error.message
    :api.describeError(error);
// Every page assigns `rerender`; a response may only render while its page is still the current one.
function beginView(view){
    rerender=view;
    return ()=>rerender===view
}
function sessionControls(u){
    if(u)return `
            <button data-action="logout">Вийти
            </button>
            <button class="user-pill" data-user="${esc(u.username)}" title="Мій публічний профіль: ${esc(u.username)}">${esc((u.username||'?').slice(0,1).toUpperCase())}
            </button>`;
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
function layout(content,active){
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
function loadingBlock(text){
    return `
            <div class="empty" role="status" aria-live="polite" aria-busy="true">
            <h3>${esc(text)}
            </h3>
            </div>`
}
// A network failure (status 0) can be the API being down/asleep, or one request failing without CORS headers
// (e.g. an unhandled server error). GET /api/health tells them apart; see runHealthChecks().
function healthHint(error){
    return error&&typeof error==='object'&&error.status===0?`
            <p class="small muted" data-health-check>Перевіряємо, чи доступний сервер GameNest…
            </p>`:''
}
function errorBlock(title,error,retryAction){
    return `
            <div class="empty" role="alert">
            <h3>${esc(title)}
            </h3>
            <p>${esc(describe(error)||'Спробуй ще раз трохи пізніше.')}
            </p>${healthHint(error)}${retryAction?`
            <button class="btn primary" data-action="${esc(retryAction)}">Спробувати ще раз
            </button>`:''}
            </div>`
}
function runHealthChecks(){
    $$('[data-health-check]:not([data-checked])').forEach(el=>{
        el.dataset.checked='1';
        api.health().then(ok=>{
            if(!el.isConnected)return;
            el.textContent=ok
                ?'Сервер GameNest працює — збій стосується саме цього запиту (можлива помилка на сервері). Спробуй ще раз; якщо повториться — повідом адміністратора.'
                :'Сервер GameNest зараз недоступний або прокидається (до хвилини). Спробуй трохи пізніше.'
        })
    })
}
// Page to open after signing in: a route name or a function (e.g. back to a game page).
let afterSignIn=null;
function openAfterSignIn(){
    const next=afterSignIn||'discover';
    afterSignIn=null;
    if(typeof next==='function')next();
    else go(next)
}
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
// Admin pages: the role comes from GET /api/Profile (stored role in the database); the backend checks it on every
// admin endpoint anyway, so hiding the UI is only a convenience.
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

// ---------- Catalog (GET /api/Games) ----------
const catalogView={search:'',sort:'asc'};
const releaseDateFormat=new Intl.DateTimeFormat('uk-UA',{timeZone:'UTC',day:'numeric',month:'long',year:'numeric'});
const dateTimeFormat=new Intl.DateTimeFormat('uk-UA',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
const fmtDateTime=d=>d?dateTimeFormat.format(d):'—';
const fmtDate=d=>d?releaseDateFormat.format(d):'';
// Date → value of an <input type="date"> (dates are stored as UTC midnight).
const dateInput=d=>d instanceof Date&&!Number.isNaN(d.getTime())?d.toISOString().slice(0,10):'';
function pluralGames(n){
    const m10=n%10,m100=n%100;
    if(m10===1&&m100!==11)return `${n} гра`;
    if(m10>=2&&m10<=4&&(m100<12||m100>14))return `${n} гри`;
    return `${n} ігор`
}
// Placeholder style chosen from the id, so a game always gets the same gradient.
function apiPoster(g){
    const style='p'+((Math.abs(g.id)%6)+1);
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
function libraryBadge(item){
    return `<span class="status ${esc(item.statusCss)}" title="У твоїй бібліотеці">${esc(item.statusLabel)}</span>`
}
// "+" adds a catalog game to the library (Planned). Signed-in users only see it once their library is loaded,
// so it never offers a game that is already there.
function catalogLibraryAction(g){
    if(!me())return `
                    <button class="icon-btn" data-lib-add="${esc(g.id)}" title="Додати до бібліотеки" aria-label="Додати «${esc(g.title)}» до бібліотеки">＋
                    </button>`;
    if(Library.state.status!=='success')return '';
    const item=Library.itemFor(g.id);
    return item?libraryBadge(item):`
                    <button class="icon-btn" data-lib-add="${esc(g.id)}" title="Додати до бібліотеки" aria-label="Додати «${esc(g.title)}» до бібліотеки">＋
                    </button>`
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
                    </button>${catalogLibraryAction(g)}
                </div>
            </div>
        </article>`
}
function catalogResults(){
    const cs=Catalog.state;
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
            </p>${healthHint({status:cs.errorStatus})}
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
    const games=Catalog.query(cs.games,catalogView);
    return games.length?games.map(apiGameCard).join(''):`
            <div class="empty" style="grid-column:1/-1">
            <h3>Нічого не знайдено
            </h3>
            <p>Спробуй змінити пошуковий запит.
            </p>
            </div>`
}
function catalogCount(){
    const cs=Catalog.state;
    return cs.status==='success'?pluralGames(cs.games.length):cs.status==='error'?'Недоступно':'Завантаження…'
}
function discover(){
    rerender=()=>discover();
    const cs=Catalog.state;
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
            <input class="search" id="gameSearch" type="search" placeholder="⌕ Пошук ігор..." aria-label="Пошук ігор" value="${esc(catalogView.search)}">
            <select class="search" id="gameSort" aria-label="Сортування за назвою">
                <option value="asc" ${catalogView.sort==='asc'?'selected':''}>Назва: А → Я</option>
                <option value="desc" ${catalogView.sort==='desc'?'selected':''}>Назва: Я → А</option>
            </select>
            <button class="btn" id="resetFilters" type="button">Скинути</button>
        </div>`:''}
            <div class="grid" id="gameGrid">${catalogResults()}
            </div>
            </main>`;
    layout(content,'discover');
    bindCatalogControls();
    bindCatalogGrid();
    if(cs.status==='idle')Catalog.load();
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
// Search, sort, reset and library changes only replace the grid's content, so no listeners pile up.
function bindCatalogGrid(){
    const grid=$('#gameGrid');
    if(!grid)return;
    grid.addEventListener('click',e=>{
        const retry=e.target.closest('[data-action="catalog-retry"]');
        if(retry&&grid.contains(retry)){
            Catalog.load({force:true});
            return
        }
        const add=e.target.closest('[data-lib-add]');
        if(add&&grid.contains(add)){
            quickAddToLibrary(Number(add.dataset.libAdd),add);
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
    grid.innerHTML=catalogResults();
    runHealthChecks()
}
// POST /api/Library/{gameId} from a catalog card, status "Planned".
async function quickAddToLibrary(gameId,button){
    if(!Number.isInteger(gameId)||gameId<=0)return;
    if(!me()){
        afterSignIn='discover';
        toast('Увійди, щоб додати гру до бібліотеки.');
        auth();
        return
    }
    if(button.disabled)return;
    button.disabled=true;
    button.setAttribute('aria-busy','true');
    try{
        await Library.add(gameId,{status:'Planned'});
        toast('Гру додано до бібліотеки зі статусом «Заплановано».')
    }catch(error){
        if(error.code==='game_already_in_library')Library.load({force:true});
        if(error.code==='game_not_found')Catalog.load({force:true});
        toast(describe(error));
        if(button.isConnected){button.disabled=false;button.removeAttribute('aria-busy')}
    }
}

// ---------- Game page (GET /api/Games/{id}, versions, library, corrections, admin actions) ----------
// The game shown on the game page, so library changes can refresh its library panel only.
let detailGame=null;
function apiDetail(id){
    const view=()=>apiDetail(id);
    rerender=view;
    const isCurrent=()=>rerender===view;
    const cached=Catalog.cachedById(id);
    renderApiDetail(id,{status:'loading',game:cached},isCurrent);
    Catalog.fetchById(id).then(game=>{
        if(!isCurrent())return;
        renderApiDetail(id,game?{status:'success',game}:{status:'not-found'},isCurrent)
    }).catch(error=>{
        if(!isCurrent())return;
        renderApiDetail(id,{status:'error',error},isCurrent)
    })
}
function renderApiDetail(id,view,isCurrent){
    const back=`
            <button class="btn" data-go="discover">← Назад до каталогу
            </button>`;
    detailGame=null;
    if(view.status==='not-found'||view.status==='error'||(view.status==='loading'&&!view.game)){
        const body=view.status==='loading'?loadingBlock('Завантажуємо гру…'):view.status==='not-found'?`
            <div class="empty" role="alert">
            <h3>Гру не знайдено
            </h3>
            <p>Можливо, її архівовано або посилання застаріло.
            </p>
            <button class="btn primary" data-go="discover">До каталогу
            </button>
            </div>`:`
            <div class="empty" role="alert">
            <h3>Не вдалося завантажити гру
            </h3>
            <p>${esc(describe(view.error))}
            </p>${healthHint(view.error)}
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
    const u=me();
    const facts=[['Розробник',g.developer],['Видавець',g.publisher],['Дата виходу',fmtDate(g.releaseDate)]].filter(([,v])=>v);
    const loaded=view.status==='success';
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
            <p style="line-height:1.8;color:#6e655f;white-space:pre-line">${esc(g.description||'Опис цієї гри ще не додано.')}
            </p>${loaded?'':`
            <div class="notice" role="status" aria-busy="true">Оновлюємо дані гри…
            </div>`}${loaded&&g.gameTitleId?`
            <div id="gameVersions" data-title-id="${esc(g.gameTitleId)}">
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
            <div id="libraryPanel">${loaded?libraryPanelHtml(g):loadingBlock('Завантаження…')}
            </div>${loaded&&u?`
            <hr class="divider">
            <button class="btn" style="width:100%" id="proposeCorrection">✎ Запропонувати виправлення
            </button>
            <p class="small muted">Помітив помилку в даних? Адміністратор перевірить і оновить гру.
            </p>`:''}${loaded&&u&&u.isAdmin?`
            <hr class="divider">
            <h3>Адміністрування
            </h3>
            <div class="row-actions">
            <button class="btn" id="editGame">Редагувати гру
            </button>
            <button class="btn danger" id="archiveGame">Архівувати
            </button>
            </div>`:''}
            </aside>
            </div>
            </main>`,'discover');
    if(!loaded)return;
    detailGame=g;
    bindLibraryPanel(g);
    $('#proposeCorrection')?.addEventListener('click',()=>submissionForm({mode:'correction',game:g}));
    $('#editGame')?.addEventListener('click',()=>adminEditGame(g.id));
    $('#archiveGame')?.addEventListener('click',e=>archiveGame(g,e.currentTarget));
    if(u&&Library.state.status==='idle')Library.load();
    loadVersions(g,isCurrent)
}
// Other catalog versions of the same game title (GET /api/GameTitles/{id}/versions).
function loadVersions(g,isCurrent){
    const box=$('#gameVersions');
    if(!box)return;
    box.innerHTML=`<p class="small muted" role="status">Шукаємо інші версії гри…</p>`;
    Catalog.versions(g.gameTitleId,g.id).then(list=>{
        if(!isCurrent()||!box.isConnected)return;
        box.innerHTML=list.length?`
            <h3>Інші версії
            </h3>
            <div class="row-actions">${list.map(v=>`
            <button class="btn" data-api-game="${esc(v.id)}">${esc(v.title)}${v.releaseYear?` · ${esc(v.releaseYear)}`:''}${v.publisher?` · ${esc(v.publisher)}`:''}
            </button>`).join('')}
            </div>`:'';
        box.querySelectorAll('[data-api-game]').forEach(b=>b.addEventListener('click',()=>openApiGame(b)))
    }).catch(error=>{
        if(!isCurrent()||!box.isConnected)return;
        box.innerHTML=`<p class="small muted">Не вдалося завантажити інші версії: ${esc(describe(error))}</p>`
    })
}
function statusOptions(selected){
    return Library.STATUSES.map(s=>`
            <option value="${esc(s.value)}" ${s.value===selected?'selected':''}>${esc(s.label)}
            </option>`).join('')
}
function libraryPanelHtml(g){
    if(!me())return `
            <p class="muted small">Увійди, щоб додати гру до бібліотеки й відстежувати її статус.
            </p>
            <button class="btn primary" style="width:100%" id="libSignIn">Увійти через Google
            </button>`;
    const ls=Library.state;
    if(ls.status==='idle'||ls.status==='loading')return `<p class="small muted" role="status" aria-busy="true">Завантажуємо бібліотеку…</p>`;
    if(ls.status==='error')return `
            <p class="small" role="alert">Не вдалося завантажити бібліотеку: ${esc(ls.error)}
            </p>
            <button class="btn" data-action="library-retry">Спробувати ще раз
            </button>`;
    const item=Library.itemFor(g.id);
    return `
            <p class="muted small">${item?`Гра у твоїй бібліотеці: ${libraryBadge(item)}${item.purchased?' · куплена':''}`:'Додай гру та обери її поточний статус.'}
            </p>
            <div class="field">
            <label for="libStatus">Статус гри
            </label>
            <select id="libStatus">${statusOptions(item?item.status:'Planned')}
            </select>
            </div>
            <label class="checkline" style="margin-top:10px">
            <input type="checkbox" id="libPurchased" ${item?.purchased?'checked':''}>
            <span>Гру куплено
            </span>
            </label>
            <button class="btn primary" style="width:100%;margin-top:14px" id="libSave">${item?'Зберегти':'Додати до бібліотеки'}
            </button>${item?`
            <button class="btn danger" style="width:100%;margin-top:8px" id="libRemove">Прибрати з бібліотеки
            </button>`:''}
            <div class="form-status small" id="libStatusMsg" role="status" aria-live="polite">
            </div>`
}
function refreshLibraryPanel(){
    const box=$('#libraryPanel');
    if(!box||!detailGame)return;
    box.innerHTML=libraryPanelHtml(detailGame);
    bindLibraryPanel(detailGame)
}
function bindLibraryPanel(g){
    const box=$('#libraryPanel');
    if(!box)return;
    box.querySelector('#libSignIn')?.addEventListener('click',()=>{
        afterSignIn=()=>apiDetail(g.id);
        auth()
    });
    box.querySelector('[data-action="library-retry"]')?.addEventListener('click',()=>Library.load({force:true}));
    const save=box.querySelector('#libSave'),remove=box.querySelector('#libRemove'),msg=box.querySelector('#libStatusMsg');
    if(!save)return;
    const setBusy=busy=>{
        [save,remove,box.querySelector('#libStatus'),box.querySelector('#libPurchased')].forEach(el=>{if(el)el.disabled=busy});
        box.setAttribute('aria-busy',busy?'true':'false')
    };
    save.addEventListener('click',async()=>{
        if(save.disabled)return;
        const values={status:box.querySelector('#libStatus').value,purchased:box.querySelector('#libPurchased').checked};
        const existing=Library.itemFor(g.id);
        setBusy(true);
        msg.textContent=existing?'Зберігаємо…':'Додаємо…';
        try{
            if(existing)await Library.update(g.id,values);
            else await Library.add(g.id,values);
            toast(existing?'Зміни в бібліотеці збережено.':'Гру додано до бібліотеки.')
            // The library state change re-renders this panel.
        }catch(error){
            if(error.code==='game_already_in_library'||error.status===404)Library.load({force:true});
            if(!msg.isConnected){toast(describe(error));return}
            msg.textContent=describe(error);
            setBusy(false)
        }
    });
    remove?.addEventListener('click',async()=>{
        if(remove.disabled||!confirm(`Прибрати «${g.title}» з бібліотеки? Статус і позначку «куплено» буде видалено.`))return;
        setBusy(true);
        msg.textContent='Прибираємо…';
        try{
            await Library.remove(g.id);
            toast('Гру прибрано з бібліотеки.')
        }catch(error){
            if(error.status===404)Library.load({force:true});
            if(!msg.isConnected){toast(describe(error));return}
            msg.textContent=describe(error);
            setBusy(false)
        }
    })
}
// Admin: DELETE /api/Games/{id} (soft delete: the game leaves the public catalog).
async function archiveGame(g,button){
    if(button.disabled||!confirm(`Архівувати «${g.title}»? Гра зникне з публічного каталогу. Відновити її через інтерфейс поки не можна.`))return;
    button.disabled=true;
    try{
        await Catalog.archiveGame(g.id);
        toast('Гру архівовано.');
        if(detailGame?.id===g.id&&$('main[data-page="game"]'))discover()
    }catch(error){
        toast(describe(error));
        if(button.isConnected)button.disabled=false
    }
}

// ---------- Shared game form (submissions, admin create/edit, own games) ----------
// Only fields the backend supports. `trailer: false` hides the trailer field (own games have none).
function gameFieldsForm(id,submitLabel,{trailer=true}={}){
    const L=Submissions.LIMITS;
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
            <input id="${id}-coverUrl" name="coverUrl" type="url" inputmode="url" maxlength="${L.url}" placeholder="https://…">`,!trailer)}${trailer?field('trailerUrl','Трейлер (URL)',`
            <input id="${id}-trailerUrl" name="trailerUrl" type="url" inputmode="url" maxlength="${L.url}" placeholder="https://…">`):''}${field('description','Опис',`
            <textarea id="${id}-description" name="description" rows="5" maxlength="${L.description}"></textarea>`,true)}
            <div class="wide form-status small" id="${id}-status" role="status" aria-live="polite">
            </div>
            <div class="wide row-actions">
            <button class="btn primary" type="submit" id="${id}-submit">${esc(submitLabel)}
            </button>
            </div>
            </form>`
}
// Fills a gameFieldsForm with existing values (strings; dates as yyyy-mm-dd).
function fillGameForm(form,values){
    for(const [name,value] of Object.entries(values||{})){
        const input=form.elements.namedItem(name);
        if(input&&value!==undefined&&value!==null)input.value=value
    }
}
const formValuesOf=x=>({
    title:x.title||'',
    releaseDate:dateInput(x.releaseDate),
    developer:x.developer||'',
    publisher:x.publisher||'',
    coverUrl:x.rawCoverUrl??x.coverUrl??'',
    trailerUrl:x.rawTrailerUrl??x.trailerUrl??'',
    description:x.description||''
});
// Validation, busy state (no double submissions) and server errors for a gameFieldsForm.
// The request is never cancelled (the server may already be processing it). When it settles:
//   afterSuccess(result) — data effects (e.g. catalog refresh), always;
//   successMessage / failureMessage — a short toast, always (it does not change the page);
//   onSuccess(result,values) and error details in the form — only if this form is still on screen, so a late
//   response cannot change or navigate away from a page the user has opened since.
function bindGameFieldsForm(form,{submitLabel,busyLabel,send,successMessage,failureMessage,afterSuccess,onSuccess,onError}){
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
        const values=Submissions.readForm(form);
        const errors=Submissions.validate(values);
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
            const message=describe(error);
            if(!form.isConnected){
                toast(failureMessage?`${failureMessage}: ${message}`:message);
                return
            }
            if(onError?.(error))return;
            showErrors(Submissions.fieldErrors(error));
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
        // The request has succeeded; a failing data effect must not hide that from the user or stop onSuccess.
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

// ---------- Submissions (API: GameNestSubmissions) ----------
function submissionStatus(s){
    return `<span class="status ${esc(s.statusCss)}">${esc(s.statusLabel)}</span>`
}
function authorLink(s){
    return s.submittedBy?`<button class="text-button" data-user="${esc(s.submittedBy)}">${esc(s.submittedBy)}</button>`:esc('Користувач #'+s.submittedByUserId)
}
// One page for proposing a new game, proposing a correction of a catalog game and editing a pending submission.
//   {mode:'new', prefill?}                 — POST /api/Submissions (NewGame); prefill e.g. from an own game
//   {mode:'correction', game}              — POST /api/Submissions (Correction of game.id)
//   {mode:'edit', submission, admin?}      — PUT /api/Submissions/{id} (owner or admin, Pending only)
function submissionForm(opts={mode:'new'}){
    beginView(()=>submissionForm(opts));
    const u=requireSignedIn(opts.mode==='new'&&!opts.prefill?'submit':()=>submissionForm(opts),'Увійди, щоб запропонувати гру.');
    if(!u)return;
    const {mode}=opts;
    const texts={
        new:{eyebrow:'Каталог GameNest',title:'Запропонувати гру',lead:'Не знайшов гру в каталозі? Заповни форму — адміністратор розгляне пропозицію, і після схвалення гра з’явиться в каталозі.',submit:'Надіслати на розгляд',busy:'Надсилаємо…',ok:'Пропозицію надіслано на розгляд.',fail:'Пропозицію не надіслано'},
        correction:{eyebrow:'Виправлення гри',title:`Виправлення: ${opts.game?.title||''}`,lead:'Зміни поля, які потрібно виправити. Після схвалення адміністратором дані гри в каталозі оновляться.',submit:'Надіслати виправлення',busy:'Надсилаємо…',ok:'Виправлення надіслано на розгляд.',fail:'Виправлення не надіслано'},
        edit:{eyebrow:opts.submission?.typeLabel||'Пропозиція',title:`Редагування: ${opts.submission?.title||''}`,lead:'Змінити можна лише пропозицію, яку ще не розглянули.',submit:'Зберегти зміни',busy:'Зберігаємо…',ok:'Пропозицію оновлено.',fail:'Зміни не збережено'}
    }[mode];
    const back=mode==='correction'?`<button class="btn" data-api-game="${esc(opts.game.id)}">← До гри</button>`
        :mode==='edit'&&opts.admin?`<button class="btn" data-submission="${esc(opts.submission.id)}">← До пропозиції</button>`
        :mode==='edit'?`<button class="btn" data-go="submissions">← До моїх пропозицій</button>`
        :opts.prefill?`<button class="btn" data-go="mygames">← До моїх ігор</button>`
        :`<button class="btn" data-go="discover">← До каталогу</button>`;
    layout(`
            <main class="container" data-page="submit">${back}
            <div class="section-head" style="margin-top:18px">
            <div>
            <div class="eyebrow">${esc(texts.eyebrow)}
            </div>
            <h1 style="font-size:36px">${esc(texts.title)}
            </h1>
            <p class="muted">${esc(texts.lead)}
            </p>
            </div>${opts.admin?'':`
            <button class="btn" data-go="submissions">Мої пропозиції
            </button>`}
            </div>${opts.prefill?`
            <div class="notice" role="note">Поля заповнено з твоєї власної гри. Перевір їх: у каталозі обкладинка й трейлер мають бути посиланнями https://.
            </div>`:''}
            <section class="panel">${gameFieldsForm('submissionForm',texts.submit)}
            </section>
            </main>`,opts.admin?'admin':'discover');
    const form=$('#submissionForm');
    if(mode==='correction')fillGameForm(form,formValuesOf(opts.game));
    if(mode==='edit')fillGameForm(form,formValuesOf(opts.submission));
    if(opts.prefill)fillGameForm(form,formValuesOf(opts.prefill));
    bindGameFieldsForm(form,{
        submitLabel:texts.submit,
        busyLabel:texts.busy,
        send:values=>mode==='correction'?Submissions.submitCorrection(opts.game.id,values)
            :mode==='edit'?Submissions.update(opts.submission,values)
            :Submissions.submit(values),
        successMessage:texts.ok,
        failureMessage:texts.fail,
        onError:error=>{
            if(mode==='edit'&&error.status===409){
                toast(describe(error));
                opts.admin?adminSubmission(opts.submission.id):mySubmissions();
                return true
            }
            return false
        },
        onSuccess:result=>mode==='edit'&&opts.admin?adminSubmission(result?.id??opts.submission.id):mySubmissions()
    })
}
function submitGame(){
    submissionForm({mode:'new'})
}
const SUBMISSION_STATUS_FILTERS=[['','Усі'],['Pending','На розгляді'],['Approved','Схвалені'],['Rejected','Відхилені']];
const SUBMISSION_TYPE_FILTERS=[['','Усі типи'],['NewGame','Нові ігри'],['Correction','Виправлення']];
function filterChips(list,active,attr){
    return list.map(([v,l])=>`
            <button class="chip ${v===active?'active':''}" ${attr}="${esc(v)}">${esc(l)}
            </button>`).join('')
}
// User: own submissions (GET /api/Submissions/mine?status=…); type is filtered here (the API filters status only).
const mineFilter={status:'',type:''};
function mySubmissions(){
    const isCurrent=beginView(()=>mySubmissions());
    const u=requireSignedIn('submissions','Увійди, щоб переглянути свої пропозиції.');
    if(!u)return;
    const {status,type}=mineFilter;
    const render=body=>{
        layout(`
            <main class="container" data-page="submissions">
            <div class="section-head">
            <div>
            <div class="eyebrow">Каталог GameNest
            </div>
            <h1 style="font-size:36px">Мої пропозиції
            </h1>
            <p class="muted">Статус змінюється після перевірки адміністратором. Поки пропозицію не розглянули, її можна змінити або скасувати.
            </p>
            </div>
            <button class="btn primary" data-go="submit">＋ Запропонувати гру
            </button>
            </div>
            <div class="toolbar filters">${filterChips(SUBMISSION_STATUS_FILTERS,status,'data-mine-status')}
            </div>
            <div class="toolbar filters">${filterChips(SUBMISSION_TYPE_FILTERS,type,'data-mine-type')}
            </div>${body}
            </main>`,'profile');
        $$('[data-mine-status]').forEach(b=>b.addEventListener('click',()=>{mineFilter.status=b.dataset.mineStatus;mySubmissions()}));
        $$('[data-mine-type]').forEach(b=>b.addEventListener('click',()=>{mineFilter.type=b.dataset.mineType;mySubmissions()}))
    };
    render(loadingBlock('Завантажуємо пропозиції…'));
    Submissions.mine(status).then(all=>{
        if(!isCurrent())return;
        const items=all.filter(s=>!type||s.type===type);
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
            </p>`:''}
            <div class="row-actions">${s.gameId&&(s.status==='Approved'||s.type==='Correction')?`
            <button class="btn" data-api-game="${esc(s.gameId)}">${s.type==='Correction'?'Гра, яку виправляю':'Переглянути в каталозі'}
            </button>`:''}${s.status==='Pending'?`
            <button class="btn" data-edit-submission="${esc(s.id)}">Редагувати
            </button>
            <button class="btn danger" data-withdraw-submission="${esc(s.id)}">Скасувати
            </button>`:''}
            </div>
            </article>`).join('')}
            </div>`:all.length||status?`
            <div class="empty">
            <h3>Немає пропозицій за цим фільтром
            </h3>
            </div>`:`
            <div class="empty">
            <h3>Пропозицій поки немає
            </h3>
            <p>Запропонуй гру, якої ще немає в каталозі.
            </p>
            <button class="btn primary" data-go="submit">Запропонувати гру
            </button>
            </div>`);
        const byId=id=>items.find(s=>s.id===Number(id));
        $$('[data-edit-submission]').forEach(b=>b.addEventListener('click',()=>{
            const s=byId(b.dataset.editSubmission);
            if(s)submissionForm({mode:'edit',submission:s})
        }));
        $$('[data-withdraw-submission]').forEach(b=>b.addEventListener('click',()=>withdrawSubmission(byId(b.dataset.withdrawSubmission),b)))
    }).catch(error=>{
        if(!isCurrent())return;
        render(errorBlock('Не вдалося завантажити пропозиції',error,'submissions-retry'))
    })
}
// DELETE /api/Submissions/{id}: only the owner's own Pending submission.
async function withdrawSubmission(s,button){
    if(!s||button.disabled||!confirm(`Скасувати пропозицію «${s.title}»? Її буде видалено, відновити не вийде.`))return;
    button.disabled=true;
    try{
        await Submissions.remove(s.id);
        toast('Пропозицію скасовано.')
    }catch(error){
        toast(describe(error))
    }
    // Re-rendered only if the submissions page is still open.
    if($('main[data-page="submissions"]'))mySubmissions()
}

// ---------- Admin (moderation, catalog management) ----------
function adminTabs(tab){
    const chip=(key,label)=>`<button class="chip ${tab===key?'active':''}" data-admintab="${key}">${label}</button>`;
    return `
            <div class="admin-tabs" aria-label="Адміністрування">${chip('moderation','Модерація пропозицій')}${chip('create','＋ Додати гру в каталог')}
            </div>`
}
function adminShell(tab,body){
    layout(`
            <main class="container" data-page="admin-${esc(tab)}">
            <div class="eyebrow">Панель керування
            </div>
            <h1 style="font-size:36px">Адміністрування GameNest
            </h1>
            <p class="muted">Модеруй пропозиції користувачів і керуй каталогом GameNest. Зміни одразу потрапляють на сервер; редагування й архівування гри — на сторінці гри.
            </p>${adminTabs(tab)}${body}
            </main>`,'admin')
}
const MODERATION_FILTERS=[['Pending','На розгляді'],['Approved','Схвалені'],['Rejected','Відхилені'],['','Усі']];
let moderationFilter='Pending';
let moderationType='';
// Admin: moderation queue (GET /api/Submissions?status=…); type is filtered here.
function adminModeration(){
    const isCurrent=beginView(()=>adminModeration());
    if(!requireAdmin())return;
    const filter=moderationFilter,type=moderationType;
    const render=body=>adminShell('moderation',`
            <div class="toolbar filters" style="margin-top:18px">${MODERATION_FILTERS.map(([v,l])=>`
            <button class="chip ${v===filter?'active':''}" data-modfilter="${v}">${l}
            </button>`).join('')}
            </div>
            <div class="toolbar filters">${filterChips(SUBMISSION_TYPE_FILTERS,type,'data-modtype')}
            </div>${body}`);
    render(loadingBlock('Завантажуємо пропозиції…'));
    Submissions.adminList(filter).then(all=>{
        if(!isCurrent())return;
        const items=all.filter(s=>!type||s.type===type);
        render(items.length?`
            <div class="submission-list">${items.map(s=>`
            <article class="panel submission-item">
            <div class="submission-head">
            <div>
            <h3>${esc(s.title)}
            </h3>
            <div class="small muted">${authorLink(s)} · ${esc(fmtDateTime(s.createdAt))} · ${esc(s.typeLabel)}
            </div>
            </div>${submissionStatus(s)}
            </div>
            <button class="btn" data-submission="${esc(s.id)}">${s.status==='Pending'?'Розглянути':'Переглянути'}
            </button>
            </article>`).join('')}
            </div>`:`
            <div class="empty">
            <h3>${filter==='Pending'&&!type?'Немає пропозицій на розгляді':'Пропозицій не знайдено'}
            </h3>
            </div>`)
    }).catch(error=>{
        if(!isCurrent())return;
        render(errorBlock('Не вдалося завантажити пропозиції',error,'moderation-retry'))
    })
}
// Admin: one submission with all submitted data; edit, approve or reject while it is pending.
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
    Submissions.get(id).then(s=>{
        if(!isCurrent())return;
        if(!s){
            render(errorBlock('Не вдалося прочитати пропозицію','Сервер повернув некоректні дані.'));
            return
        }
        renderAdminSubmission(s,render,isCurrent)
    }).catch(error=>{
        if(!isCurrent())return;
        if(error.status===404){
            render(errorBlock('Пропозицію не знайдено','Можливо, її скасував автор.'));
            return
        }
        render(errorBlock('Не вдалося завантажити пропозицію',error,'submission-retry'))
    })
}
function renderAdminSubmission(s,render,isCurrent){
    const cs=Catalog.state;
    const sameTitle=s.type==='NewGame'&&cs.status==='success'&&cs.games.some(g=>g.title.toLocaleLowerCase('uk')===s.title.toLocaleLowerCase('uk'));
    const urlRow=(label,safe,raw)=>raw?`
            <div class="field">
            <label>${label}
            </label>
            <div>${safe?`<a href="${esc(safe)}" target="_blank" rel="noopener noreferrer">${esc(safe)}</a>`:`<span class="muted">некоректна адреса, не показано</span>`}
            </div>
            </div>`:'';
    const facts=[['Розробник',esc(s.developer)],['Видавець',esc(s.publisher)],['Дата виходу',esc(fmtDate(s.releaseDate))],['Автор',authorLink(s)],['Подано',esc(fmtDateTime(s.createdAt))],['Тип',esc(s.typeLabel)]].filter(([,v])=>v);
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
            </div>`:''}${s.type==='Correction'&&s.gameId?`
            <div class="notice" role="note">Це виправлення наявної гри: після схвалення її дані в каталозі буде замінено даними пропозиції.
            <button class="btn" data-api-game="${esc(s.gameId)}" style="margin-left:8px">Відкрити гру
            </button>
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
            <div>${v}
            </div>
            </div>`).join('')}${urlRow('Обкладинка',s.coverUrl,s.rawCoverUrl)}${urlRow('Трейлер',s.trailerUrl,s.rawTrailerUrl)}
            <hr class="divider">${s.status==='Pending'?`
            <button class="btn" style="width:100%;margin-bottom:12px" id="editSubmission">Редагувати перед рішенням
            </button>
            <div class="field">
            <label for="rejectReason">Причина відхилення (необов’язково)
            </label>
            <textarea id="rejectReason" rows="3" maxlength="${Submissions.LIMITS.reason}" placeholder="Її побачить автор пропозиції"></textarea>
            </div>
            <div class="row-actions" style="margin-top:12px">
            <button class="btn primary" id="approveSubmission">${s.type==='Correction'?'Схвалити й оновити гру':'Схвалити й додати в каталог'}
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
    $('#editSubmission').addEventListener('click',()=>submissionForm({mode:'edit',submission:s,admin:true}));
    const approveBtn=$('#approveSubmission'),rejectBtn=$('#rejectSubmission'),status=$('#moderationStatus');
    const act=async(kind)=>{
        if(approveBtn.disabled)return;
        if(kind==='reject'&&!confirm(`Відхилити пропозицію «${s.title}»?`))return;
        approveBtn.disabled=rejectBtn.disabled=true;
        status.textContent=kind==='approve'?'Схвалюємо…':'Відхиляємо…';
        try{
            const updated=kind==='approve'
                ?await Submissions.approve(s.id)
                :await Submissions.reject(s.id,$('#rejectReason')?.value);
            if(kind==='approve')Catalog.load({force:true});
            toast(kind==='approve'?(s.type==='Correction'?'Виправлення схвалено, гру оновлено.':'Пропозицію схвалено, гру додано до каталогу.'):'Пропозицію відхилено.');
            if(isCurrent()&&updated)renderAdminSubmission(updated,render,isCurrent)
        }catch(error){
            if(!isCurrent())return;
            if(error.status===409&&error.code==='submission_already_reviewed'){
                toast('Цю пропозицію вже розглянули.');
                adminSubmission(s.id);
                return
            }
            status.textContent=describe(error);
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
        send:values=>Submissions.createGame(values),
        successMessage:'Гру додано до каталогу.',
        failureMessage:'Гру не додано',
        afterSuccess:()=>Catalog.load({force:true}),
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
// Admin: edit a catalog game (PUT /api/Games/{id}). The game keeps its game title, so its versions stay grouped.
function adminEditGame(id){
    const isCurrent=beginView(()=>adminEditGame(id));
    if(!requireAdmin())return;
    const render=body=>adminShell('',`
            <div style="margin-top:18px">
            <button class="btn" data-api-game="${esc(id)}">← До гри
            </button>
            </div>${body}`);
    render(loadingBlock('Завантажуємо гру…'));
    Catalog.fetchById(id).then(game=>{
        if(!isCurrent())return;
        if(!game){
            render(errorBlock('Гру не знайдено','Можливо, її архівовано.'));
            return
        }
        render(`
            <section class="panel" style="margin-top:18px">
            <h2>Редагування: ${esc(game.title)}
            </h2>
            <p class="muted small">Зміни одразу з’являться в публічному каталозі.
            </p>${gameFieldsForm('editGameForm','Зберегти зміни')}
            </section>`);
        const form=$('#editGameForm');
        fillGameForm(form,formValuesOf(game));
        bindGameFieldsForm(form,{
            submitLabel:'Зберегти зміни',
            busyLabel:'Зберігаємо…',
            send:values=>Catalog.updateGame(id,{...Submissions.gameBody(values),gameTitleId:game.gameTitleId}),
            successMessage:'Гру оновлено.',
            failureMessage:'Зміни не збережено',
            onSuccess:()=>apiDetail(id)
        })
    }).catch(error=>{
        if(!isCurrent())return;
        render(errorBlock('Не вдалося завантажити гру',error))
    })
}
function adminPage(tab='moderation'){
    if(tab==='create')adminCreateGame();
    else adminModeration()
}

// ---------- Sign-in (Google only: password sign-in is switched off on the server for the MVP) ----------
function auth(){
    rerender=()=>auth();
    const st=session.state;
    if(me()){
        openAfterSignIn();
        return
    }
    const configured=!!window.GameNestConfig.googleClientId;
    const busy=st.status==='loading';
    $('#app').innerHTML=`
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
            openAfterSignIn()
        }
    }catch{
        // The error is already in the session state and shown on the auth page.
        auth()
    }
}

// ---------- Library (API: GameNestLibrary) ----------
let libraryFilter='';
function libraryCard(item){
    const g=item.game||{id:item.gameId,title:`Гра #${item.gameId}`,coverUrl:null};
    return `
        <article class="game-card library-card" aria-label="Гра ${esc(g.title)}" data-lib-item="${esc(item.gameId)}">
            ${apiPoster(g)}
            <div class="card-body">
                <div class="card-title-row">
                    <div>
                        <h3>${esc(g.title)}</h3>
                        <div class="small muted">${apiGameMeta(g)||'&nbsp;'}</div>
                    </div>
                    ${libraryBadge(item)}
                </div>${g.isArchived?`
                <p class="small muted">Гру архівовано в каталозі.</p>`:''}
                <div class="library-controls">
                    <label class="small muted" for="libItemStatus-${esc(item.gameId)}">Статус</label>
                    <select class="search" id="libItemStatus-${esc(item.gameId)}" data-lib-status="${esc(item.gameId)}">${statusOptions(item.status)}
                    </select>
                    <label class="checkline">
                        <input type="checkbox" data-lib-purchased="${esc(item.gameId)}" ${item.purchased?'checked':''}>
                        <span>Куплено</span>
                    </label>
                </div>
                <div class="card-bottom">${g.isArchived?'<span></span>':`
                    <button class="btn" data-api-game="${esc(item.gameId)}">Детальніше</button>`}
                    <button class="btn danger" data-lib-remove="${esc(item.gameId)}" title="Прибрати з бібліотеки">Прибрати</button>
                </div>
            </div>
        </article>`
}
function libraryPage(){
    beginView(()=>libraryPage());
    const u=requireSignedIn('library','Увійди, щоб переглянути свою бібліотеку.');
    if(!u)return;
    const ls=Library.state;
    if(ls.status==='idle')Library.load();
    const head=`
            <div class="section-head">
            <div>
            <div class="eyebrow">Твоя колекція
            </div>
            <h1 style="font-size:36px">Моя бібліотека
            </h1>
            <p class="muted">Ігри з каталогу GameNest зі статусами, які ти обираєш сам. GameNest не рахує відсоток проходження автоматично.
            </p>
            </div>
            <div class="row-actions">
            <button class="btn primary" data-go="discover">Переглянути каталог
            </button>
            <button class="btn" data-go="mygames">Мої власні ігри
            </button>
            </div>
            </div>`;
    const page=body=>layout(`
            <main class="container" data-page="library">${head}${body}
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
            </main>`,'library');
    if(ls.status==='idle'||ls.status==='loading'){page(loadingBlock('Завантажуємо бібліотеку…'));return}
    if(ls.status==='error'){page(errorBlock('Не вдалося завантажити бібліотеку',{status:ls.errorStatus,message:ls.error},'library-retry'));return}
    const items=ls.items;
    const count=v=>items.filter(i=>i.status===v).length;
    if(libraryFilter&&!Library.STATUSES.some(s=>s.value===libraryFilter))libraryFilter='';
    const shown=items.filter(i=>!libraryFilter||i.status===libraryFilter)
        .sort((a,b)=>(a.game?.title||'').localeCompare(b.game?.title||'','uk'));
    page(`
            <div class="stat-grid">${[{label:'Ігор у бібліотеці',n:items.length},{label:'Зараз граю',n:count('Playing')},{label:'Пройдено',n:count('Completed')},{label:'Куплено',n:items.filter(i=>i.purchased).length}].map(x=>`
            <div class="stat">
            <span class="muted small">${x.label}
            </span>
            <strong>${x.n}
            </strong>
            </div>`).join('')}
            </div>${items.length?`
            <div class="toolbar filters">
            <button class="chip ${libraryFilter===''?'active':''}" data-libfilter="">Усі (${items.length})
            </button>${Library.STATUSES.map(s=>`
            <button class="chip ${libraryFilter===s.value?'active':''}" data-libfilter="${esc(s.value)}">${esc(s.label)} (${count(s.value)})
            </button>`).join('')}
            </div>`:''}
            <div class="grid" id="libraryGrid">${shown.length?shown.map(libraryCard).join(''):items.length?`
            <div class="empty" style="grid-column:1/-1">У цій категорії поки немає ігор.
            </div>`:`
            <div class="empty" style="grid-column:1/-1">
            <h3>Бібліотека поки порожня
            </h3>
            <p>Додай ігри з каталогу GameNest кнопкою «＋» або на сторінці гри.
            </p>
            <button class="btn primary" data-go="discover">Відкрити каталог
            </button>
            </div>`}
            </div>`);
    $$('[data-libfilter]').forEach(b=>b.addEventListener('click',()=>{libraryFilter=b.dataset.libfilter;libraryPage()}));
    bindLibraryGrid()
}
function bindLibraryGrid(){
    const grid=$('#libraryGrid');
    if(!grid)return;
    const lock=(card,busy)=>{
        card.querySelectorAll('select,input,button').forEach(el=>{el.disabled=busy});
        card.setAttribute('aria-busy',busy?'true':'false')
    };
    const save=async(gameId,changes,card)=>{
        const item=Library.itemFor(gameId);
        if(!item)return;
        lock(card,true);
        try{
            await Library.update(gameId,{status:item.status,purchased:item.purchased,...changes});
            toast('Зміни в бібліотеці збережено.')
        }catch(error){
            toast(describe(error));
            if(error.status===404)Library.load({force:true});
            else if($('main[data-page="library"]'))libraryPage()   // puts the controls back to the saved values
        }
    };
    grid.addEventListener('change',e=>{
        const card=e.target.closest('[data-lib-item]');
        if(!card)return;
        const gameId=Number(card.dataset.libItem);
        if(e.target.matches('[data-lib-status]'))save(gameId,{status:e.target.value},card);
        if(e.target.matches('[data-lib-purchased]'))save(gameId,{purchased:e.target.checked},card)
    });
    grid.addEventListener('click',async e=>{
        const remove=e.target.closest('[data-lib-remove]');
        if(!remove)return;
        const card=remove.closest('[data-lib-item]');
        const gameId=Number(remove.dataset.libRemove);
        const title=Library.itemFor(gameId)?.game?.title||'гру';
        if(remove.disabled||!confirm(`Прибрати «${title}» з бібліотеки?`))return;
        lock(card,true);
        try{
            await Library.remove(gameId);
            toast('Гру прибрано з бібліотеки.')
        }catch(error){
            toast(describe(error));
            if(error.status===404)Library.load({force:true});
            else lock(card,false)
        }
    })
}

// ---------- Own games (API: GameNestUserGames) — private records, not catalog games ----------
function myGames(){
    const isCurrent=beginView(()=>myGames());
    const u=requireSignedIn('mygames','Увійди, щоб переглянути свої ігри.');
    if(!u)return;
    const render=body=>{
        layout(`
            <main class="container" data-page="mygames">
            <button class="btn" data-go="library">← До бібліотеки
            </button>
            <div class="section-head" style="margin-top:18px">
            <div>
            <div class="eyebrow">Особисті записи
            </div>
            <h1 style="font-size:36px">Мої власні ігри
            </h1>
            <p class="muted">Ігри, яких немає в каталозі GameNest: їх бачиш лише ти. Будь-яку з них можна запропонувати до каталогу.
            </p>
            </div>
            <button class="btn primary" id="newUserGame">＋ Додати власну гру
            </button>
            </div>${body}
            </main>`,'library');
        $('#newUserGame').addEventListener('click',()=>userGameForm())
    };
    render(loadingBlock('Завантажуємо твої ігри…'));
    UserGames.list().then(list=>{
        if(!isCurrent())return;
        const games=list.slice().sort((a,b)=>a.title.localeCompare(b.title,'uk'));
        render(games.length?`
            <div class="grid">${games.map(g=>`
            <article class="game-card" aria-label="Гра ${esc(g.title)}">
            ${apiPoster(g)}
            <div class="card-body">
            <div class="card-title-row">
            <div>
            <h3>${esc(g.title)}</h3>
            <div class="small muted">${apiGameMeta(g)||'&nbsp;'}</div>
            </div>
            </div>${g.description?`
            <p class="small muted clamp">${esc(g.description)}</p>`:''}
            <div class="row-actions" style="margin-top:12px">
            <button class="btn" data-edit-usergame="${esc(g.id)}">Редагувати</button>
            <button class="btn" data-propose-usergame="${esc(g.id)}" title="Створити пропозицію для каталогу з даними цієї гри">До каталогу</button>
            <button class="btn danger" data-delete-usergame="${esc(g.id)}">Видалити</button>
            </div>
            </div>
            </article>`).join('')}
            </div>`:`
            <div class="empty">
            <h3>Власних ігор поки немає
            </h3>
            <p>Додай гру, якої немає в каталозі, щоб не загубити її.
            </p>
            </div>`);
        const byId=id=>games.find(g=>g.id===Number(id));
        $$('[data-edit-usergame]').forEach(b=>b.addEventListener('click',()=>userGameForm(byId(b.dataset.editUsergame))));
        $$('[data-propose-usergame]').forEach(b=>b.addEventListener('click',()=>submissionForm({mode:'new',prefill:byId(b.dataset.proposeUsergame)})));
        $$('[data-delete-usergame]').forEach(b=>b.addEventListener('click',()=>deleteUserGame(byId(b.dataset.deleteUsergame),b)))
    }).catch(error=>{
        if(!isCurrent())return;
        render(errorBlock('Не вдалося завантажити твої ігри',error,'mygames-retry'))
    })
}
async function deleteUserGame(g,button){
    if(!g||button.disabled||!confirm(`Видалити «${g.title}»? Запис буде видалено назавжди.`))return;
    button.disabled=true;
    try{
        await UserGames.remove(g.id);
        toast('Гру видалено.')
    }catch(error){
        toast(describe(error))
    }
    if($('main[data-page="mygames"]'))myGames()
}
// Create (POST /api/UserGames) or edit (PUT /api/UserGames/{id}) an own game.
function userGameForm(existing){
    beginView(()=>userGameForm(existing));
    const u=requireSignedIn('mygames','Увійди, щоб додати власну гру.');
    if(!u)return;
    const label=existing?'Зберегти зміни':'Додати гру';
    layout(`
            <main class="container" data-page="usergame-form">
            <button class="btn" data-go="mygames">← До моїх ігор
            </button>
            <div class="section-head" style="margin-top:18px">
            <div>
            <div class="eyebrow">Особисті записи
            </div>
            <h1 style="font-size:36px">${existing?`Редагування: ${esc(existing.title)}`:'Нова власна гра'}
            </h1>
            <p class="muted">Ці дані бачиш лише ти. Статуси проходження доступні для ігор із каталогу в бібліотеці.
            </p>
            </div>
            </div>
            <section class="panel">${gameFieldsForm('userGameForm',label,{trailer:false})}
            </section>
            </main>`,'library');
    const form=$('#userGameForm');
    if(existing)fillGameForm(form,formValuesOf(existing));
    bindGameFieldsForm(form,{
        submitLabel:label,
        busyLabel:'Зберігаємо…',
        send:values=>existing?UserGames.update(existing.id,values):UserGames.create(values),
        successMessage:existing?'Зміни збережено.':'Гру додано.',
        failureMessage:'Не збережено',
        onError:error=>{
            if(existing&&error.status===404){toast('Цю гру вже видалено.');myGames();return true}
            return false
        },
        onSuccess:()=>myGames()
    })
}

// ---------- Profile, settings, public profiles (API: GameNestProfile) ----------
function profile(){
    const isCurrent=beginView(()=>profile());
    const u=requireSignedIn('profile','Увійди, щоб відкрити кабінет.');
    if(!u)return;
    const ls=Library.state;
    if(ls.status==='idle')Library.load();
    layout(`
            <main class="container" data-page="profile">
            <div class="eyebrow">Особистий простір
            </div>
            <h1 style="font-size:36px">Особистий кабінет
            </h1>
            <p class="muted">Профіль, бібліотека та пропозиції нових ігор.
            </p>
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
            <button data-go="mygames">◇ Мої власні ігри
            </button>
            <button data-go="submissions">☆ Мої пропозиції
            </button>
            <button data-go="settings">⚙ Налаштування профілю
            </button>
            <button data-user="${esc(u.username)}">◎ Мій публічний профіль
            </button>
            <button data-action="logout">↪ Вийти
            </button>
            </nav>
            </aside>
            <section>
            <div class="stat-grid">
            <div class="stat">
            <span class="muted small">Ігор у бібліотеці
            </span>
            <strong id="statLibrary">${ls.status==='success'?ls.items.length:'…'}
            </strong>
            </div>
            <div class="stat">
            <span class="muted small">Власних ігор
            </span>
            <strong id="statUserGames">…
            </strong>
            </div>
            <div class="stat">
            <span class="muted small">Пропозицій на розгляді
            </span>
            <strong id="statPending">…
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
            </main>`,'profile');
    // Counters come from the API; a failed one shows "—" instead of a made-up number.
    const set=(sel,value)=>{if(isCurrent()&&$(sel))$(sel).textContent=value};
    Library.load().then(()=>set('#statLibrary',Library.state.status==='success'?Library.state.items.length:'—'));
    UserGames.list().then(list=>set('#statUserGames',list.length),()=>set('#statUserGames','—'));
    Submissions.mine('Pending').then(list=>set('#statPending',list.length),()=>set('#statPending','—'))
}
function settings(){
    const isCurrent=beginView(()=>settings());
    const u=requireSignedIn('settings','Увійди, щоб змінити налаштування.');
    if(!u)return;
    const N=Profile.USERNAME;
    layout(`
            <main class="container" data-page="settings">
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
            <h2>Профіль
            </h2>
            <form id="usernameForm" class="form-grid" novalidate>
            <div class="field wide" data-field="username">
            <label for="profileUsername">Ім’я користувача
            </label>
            <input id="profileUsername" name="username" value="${esc(u.username)}" minlength="${N.min}" maxlength="${N.max}" autocomplete="nickname" required>
            <div class="field-error small" id="profileUsername-error" aria-live="polite">
            </div>
            </div>
            <div class="field wide">
            <label for="profileEmail">Електронна пошта (з Google)
            </label>
            <input id="profileEmail" value="${esc(u.email)}" disabled>
            </div>
            <div class="field wide">
            <label for="profileRole">Роль
            </label>
            <input id="profileRole" value="${u.isAdmin?'Адміністратор':'Користувач'}" disabled>
            </div>
            <div class="wide form-status small" id="usernameStatus" role="status" aria-live="polite">
            </div>
            <div class="wide row-actions">
            <button class="btn primary" type="submit" id="usernameSave">Зберегти ім’я
            </button>
            <button class="btn" type="button" data-user="${esc(u.username)}">Мій публічний профіль
            </button>
            </div>
            </form>
            </section>
            <section class="panel" style="max-width:650px;margin-top:18px" id="privacyPanel">
            <h2>Приватність
            </h2>${loadingBlock('Завантажуємо налаштування…')}
            </section>
            </main>`,'profile');
    bindUsernameForm(u);
    loadPrivacy(isCurrent)
}
function bindUsernameForm(u){
    const form=$('#usernameForm'),input=$('#profileUsername'),button=$('#usernameSave'),status=$('#usernameStatus');
    const field=form.querySelector('[data-field="username"]'),fieldError=$('#profileUsername-error');
    const showError=msg=>{
        field.classList.toggle('invalid',!!msg);
        fieldError.textContent=msg||'';
        input.setAttribute('aria-invalid',msg?'true':'false')
    };
    form.addEventListener('submit',async e=>{
        e.preventDefault();
        if(button.disabled)return;
        const name=input.value.trim();
        const invalid=Profile.validateUsername(name);
        showError(invalid);
        status.textContent='';
        if(invalid){input.focus();return}
        if(name===u.username){status.textContent='Ім’я не змінилося.';return}
        button.disabled=true;
        button.textContent='Зберігаємо…';
        try{
            await Profile.updateUsername(name);
            toast('Ім’я користувача змінено.')
            // The session reloads the profile and re-renders this page with the new name.
        }catch(error){
            if(!form.isConnected){toast(describe(error));return}
            if(error.code==='username_already_exists'||error.status===400)showError(describe(error));
            status.textContent=describe(error);
            button.disabled=false;
            button.textContent='Зберегти ім’я'
        }
    })
}
function loadPrivacy(isCurrent){
    const panel=$('#privacyPanel');
    const render=html=>{if(isCurrent()&&panel.isConnected)panel.innerHTML=`<h2>Приватність</h2>${html}`};
    Profile.getPrivacy().then(p=>{
        render(`
            <form id="privacyForm" novalidate>
            <label class="checkline">
            <input type="checkbox" name="isProfilePublic" ${p.isProfilePublic?'checked':''}>
            <span><b>Публічний профіль.</b> Інші бачать твоє ім’я на сторінці профілю. Якщо вимкнути — профіль для них не існує.</span>
            </label>
            <label class="checkline" style="margin-top:10px">
            <input type="checkbox" name="isLibraryPublic" ${p.isLibraryPublic?'checked':''}>
            <span><b>Публічна бібліотека.</b> Налаштування зберігається на сервері; перегляд чужих бібліотек GameNest поки не надає.</span>
            </label>
            <div class="form-status small" id="privacyStatus" role="status" aria-live="polite">
            </div>
            <div class="row-actions" style="margin-top:12px">
            <button class="btn primary" type="submit" id="privacySave">Зберегти приватність
            </button>
            </div>
            </form>`);
        const form=$('#privacyForm');
        if(!form)return;
        form.addEventListener('submit',async e=>{
            e.preventDefault();
            const button=$('#privacySave'),status=$('#privacyStatus');
            if(button.disabled)return;
            button.disabled=true;
            status.textContent='Зберігаємо…';
            try{
                const saved=await Profile.updatePrivacy({isProfilePublic:form.isProfilePublic.checked,isLibraryPublic:form.isLibraryPublic.checked});
                form.isProfilePublic.checked=saved.isProfilePublic;
                form.isLibraryPublic.checked=saved.isLibraryPublic;
                status.textContent='Збережено.';
                toast('Налаштування приватності збережено.')
            }catch(error){
                status.textContent=describe(error)
            }finally{
                if(button.isConnected)button.disabled=false
            }
        })
    }).catch(error=>{
        render(errorBlock('Не вдалося завантажити налаштування приватності',error,'privacy-retry'));
        $('#privacyPanel [data-action="privacy-retry"]')?.addEventListener('click',()=>{
            panel.innerHTML=`<h2>Приватність</h2>${loadingBlock('Завантажуємо налаштування…')}`;
            loadPrivacy(isCurrent)
        });
        runHealthChecks()
    })
}
// Public profile (GET /api/Profile/{username}): the API returns only the username of public profiles.
function publicProfile(username){
    const isCurrent=beginView(()=>publicProfile(username));
    const render=body=>layout(`
            <main class="container" data-page="user">
            <button class="btn" data-go="discover">← До каталогу
            </button>
            <div style="margin-top:18px">${body}
            </div>
            </main>`,'');
    render(loadingBlock('Завантажуємо профіль…'));
    Profile.getPublic(username).then(p=>{
        if(!isCurrent())return;
        const own=me()?.username===username;
        render(p?`
            <section class="panel" style="max-width:650px">
            <div class="profile-head">
            <div class="avatar">${esc(p.username.slice(0,1).toUpperCase())}
            </div>
            <div>
            <div class="eyebrow">Профіль GameNest
            </div>
            <h1 style="font-size:32px;margin:0">${esc(p.username)}
            </h1>
            </div>
            </div>
            <p class="muted small">Публічна сторінка показує лише ім’я користувача: перегляд чужих бібліотек GameNest поки не надає.
            </p>${own?`
            <button class="btn" data-go="settings">Налаштування приватності
            </button>`:''}
            </section>`:`
            <div class="empty">
            <h3>Профіль не знайдено
            </h3>
            <p>${own?'Твій профіль зараз приватний: інші користувачі його не бачать.':'Такого користувача немає або його профіль приватний.'}
            </p>${own?`
            <button class="btn primary" data-go="settings">Налаштування приватності
            </button>`:''}
            </div>`)
    }).catch(error=>{
        if(!isCurrent())return;
        render(errorBlock('Не вдалося завантажити профіль',error))
    })
}

// ---------- Navigation ----------
function go(page,arg){
    if(page==='discover')discover();
    else if(page==='auth')auth();
    else if(page==='library')libraryPage();
    else if(page==='mygames')myGames();
    else if(page==='profile')profile();
    else if(page==='admin')adminPage();
    else if(page==='settings')settings();
    else if(page==='game')apiDetail(arg);
    else if(page==='submit')submitGame();
    else if(page==='submissions')mySubmissions();
    else if(page==='user')publicProfile(arg);
    else discover()
}
function bind(){
    $$('[data-go]').forEach(b=>b.addEventListener('click',e=>{
        e.preventDefault();
        go(b.dataset.go)
    }));
    $$('[data-action="logout"]').forEach(b=>b.addEventListener('click',()=>{
        session.signOut();
        toast('Ти вийшов з акаунта.');
        discover()
    }));
    $$('[data-action="retry-profile"]').forEach(b=>b.addEventListener('click',()=>session.reloadProfile()));
    $$('[data-submission]').forEach(b=>b.addEventListener('click',()=>{
        const id=Number(b.dataset.submission);
        if(Number.isInteger(id)&&id>0)adminSubmission(id)
    }));
    $$('[data-modfilter]').forEach(b=>b.addEventListener('click',()=>{
        moderationFilter=b.dataset.modfilter;
        adminModeration()
    }));
    $$('[data-modtype]').forEach(b=>b.addEventListener('click',()=>{
        moderationType=b.dataset.modtype;
        adminModeration()
    }));
    $$('[data-user]').forEach(b=>b.addEventListener('click',()=>{
        if(b.dataset.user)publicProfile(b.dataset.user)
    }));
    $$('[data-action="submissions-retry"]').forEach(b=>b.addEventListener('click',()=>mySubmissions()));
    $$('[data-action="moderation-retry"]').forEach(b=>b.addEventListener('click',()=>adminModeration()));
    $$('[data-action="submission-retry"]').forEach(b=>b.addEventListener('click',()=>rerender()));
    $$('[data-action="mygames-retry"]').forEach(b=>b.addEventListener('click',()=>myGames()));
    $$('[data-action="library-retry"]').filter(b=>!b.closest('#libraryPanel')).forEach(b=>b.addEventListener('click',()=>Library.load({force:true})));
    // API catalog games. Elements inside #gameGrid are handled by bindCatalogGrid() (delegation), not here.
    $$('[data-api-game]').filter(b=>!b.closest('#gameGrid')).forEach(b=>b.addEventListener('click',()=>openApiGame(b)));
    $$('img[data-cover]').filter(img=>!img.closest('#gameGrid')).forEach(img=>img.addEventListener('error',()=>onCoverError(img),{once:true}));
    $$('[data-scroll]').forEach(b=>b.addEventListener('click',()=>document.getElementById(b.dataset.scroll)?.scrollIntoView({behavior:'smooth'})));
    $$('[data-admintab]').forEach(b=>b.addEventListener('click',()=>adminPage(b.dataset.admintab)));
    runHealthChecks()
}
// Every session change (sign-in, profile loaded, 401, sign-out) re-renders the current page;
// pages that need a user fall back to the sign-in page by themselves.
let lastStatus=session.state.status;
session.subscribe(st=>{
    if(lastStatus==='authenticated'&&st.status==='anonymous'&&st.error)toast(st.error);
    lastStatus=st.status;
    // The library is needed on catalog cards and game pages as soon as the user is known.
    if(st.status==='authenticated'&&Library.state.status==='idle')Library.load();
    rerender()
});
// The catalog loads asynchronously; refresh the catalog page (only) when its state changes.
Catalog.subscribe(()=>{
    if($('main[data-page="discover"]'))discover()
});
// Library changes refresh only what shows the library: catalog cards, the game page panel, the library page.
Library.subscribe(()=>{
    if($('main[data-page="discover"]'))renderCatalogResults();
    else if($('main[data-page="game"]'))refreshLibraryPanel();
    else if($('main[data-page="library"]'))libraryPage();
    else if($('main[data-page="profile"]')&&$('#statLibrary')&&Library.state.status==='success')$('#statLibrary').textContent=Library.state.items.length
});
discover();
if(session.hasToken())session.restore();
}
)();
