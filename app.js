(() => {
    const $ = (s,
    root=document) => root.querySelector(s);
    const $$ = (s,
    root=document) => [...root.querySelectorAll(s)];
    const STORAGE = 'gamenest_v1';
    const { STATUSES, seedGames } = window.GameNestData;
    const statusClass = s => s==='Граю'?'playing':s==='Закінчена'?'completed':s==='Відкладена'?'wishlist':'';
    
function fresh(){
    return {
        games:seedGames,
        users:[{
            id:'admin',
            name:'Адміністратор',
            email:'admin@gamenest.local',
            password:'admin123',
            role:'admin'
        },
    {
        id:'demo',
        name:'Марія',
        email:'user@example.com',
        password:'user123',
        role:'user'
    }
],
currentUser:null,
libraries:{
    demo:{
        g1:'Граю',
        g2:'Куплена',
        g5:'Закінчена'
    },
admin:{
}
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
            !Array.isArray(parsed.games) ||
            !Array.isArray(parsed.users)
        ) {
            return fresh();
        }

        return {
            ...fresh(),
            ...parsed,
            libraries: parsed.libraries || {},
            proposals: Array.isArray(parsed.proposals)
                ? parsed.proposals
                : [],
            lists: parsed.lists || {}
        };
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
function me(){
    return db.users.find(u=>u.id===db.currentUser)||null
}
function library(){
    const u=me();
    return u?(db.libraries[u.id]||(db.libraries[u.id]={
    }
)):{
}
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
function header(active='discover'){
    const u=me();
    return `
            <header class="topbar">
            <a class="brand" href="#" data-go="discover">
            <img src="assets/photo_2026-11-10_13-38-08.jpg" alt="GameNest">
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
            </button>${u&&u.role==='admin'?`
            <button data-go="admin" class="${active==='admin'?'active':''}">⚙ &nbsp;Адмінпанель
            </button>`:''}${u?`
            <button data-action="logout">Вийти
            </button>
            <span class="user-pill" title="${esc(u.name)}">${esc(u.name.slice(0,1).toUpperCase())}
            </span>`:`
            <button class="login" data-go="auth">Увійти / Реєстрація
            </button>`}
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

function discover(){
    const content=`
            <main class="container">
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
            <p class="muted small">Знайди гру за назвою, жанром або платформою.
            </p>
            </div>
            <span class="status">${db.games.length} ігор
            </span>
            </div>
            
        <div class="toolbar">
            <input
                class="search"
                id="gameSearch"
                placeholder="⌕ Пошук ігор..."
                aria-label="Пошук ігор"
            >

            <select class="search" id="genreFilter" aria-label="Фільтр за жанром">
                <option value="">Усі жанри</option>
                ${[...new Set(db.games.map(g => g.genre))].map(x => `
                    <option>${esc(x)}</option>
                `).join('')}
            </select>

            <select class="search" id="platformFilter" aria-label="Фільтр за платформою">
                <option value="">Усі платформи</option>
                ${[...new Set(db.games.map(g => g.platform))].map(x => `
                    <option>${esc(x)}</option>
                `).join('')}
            </select>

            <button class="btn" id="resetFilters" type="button">
                Скинути фільтри
            </button>
        </div>

            <div class="grid" id="gameGrid">${db.games.map(gameCard).join('')}
            </div>
            </main>`;
    layout(content,
    'discover');
    $('#gameSearch').addEventListener('input',
    filterGames);
    $('#genreFilter').addEventListener('change',
    filterGames);
    $('#resetFilters').addEventListener('click', () => {
    $('#gameSearch').value = '';
    $('#genreFilter').value = '';
    $('#platformFilter').value = '';

    filterGames();
});
}

function filterGames() {
    const searchInput = $('#gameSearch');
    const genreFilter = $('#genreFilter');
    const platformFilter = $('#platformFilter');

    const query = searchInput.value
        .trim()
        .toLowerCase();

    const genre = genreFilter.value;
    const platform = platformFilter.value;

    const filteredGames = db.games.filter(game => {
        const searchableText = [
            game.title,
            game.developer,
            game.publisher,
            game.genre,
            game.platform,
            game.description
        ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();

        const matchesSearch = searchableText.includes(query);
        const matchesGenre = !genre || game.genre === genre;
        const matchesPlatform = !platform || game.platform === platform;

        return matchesSearch && matchesGenre && matchesPlatform;
    });

    const gameGrid = $('#gameGrid');

    gameGrid.innerHTML = filteredGames.length
        ? filteredGames.map(gameCard).join('')
        : `
            <div class="empty" style="grid-column:1/-1">
                <h3>Нічого не знайдено</h3>
                <p>Спробуй змінити пошуковий запит або фільтри.</p>
            </div>
        `;

    bind();
}

function auth(mode='login'){
    const isReg=mode==='register';
    $('#app').innerHTML=
    `
            <div class="shell">${header('')}
            <main class="auth-wrap">
            <section class="auth-card">
            <div class="auth-brand">
            <img src="assets/gamenest-logo.png" alt="">
            <div class="eyebrow">Ласкаво просимо до GameNest
            </div>
            <h2>${isReg?'Створи акаунт':'Раді тебе бачити'}
            </h2>
            <p class="muted small">${isReg?'Збирай власну бібліотеку ігор.':'Увійди, щоб продовжити свою ігрову історію.'}
            </p>
            </div>
            <form id="authForm">${isReg?`
            <div class="field">
            <label for="name">Ім’я
            </label>
            <input id="name" required placeholder="Як до тебе звертатися">
            </div>`:''}
            <div class="field">
            <label for="email">Електронна пошта
            </label>
            <input id="email" type="email" required placeholder="you@example.com">
            </div>
            <div class="field">
            <label for="password">Пароль
            </label>
            <input id="password" type="password" required minlength="6" placeholder="Мінімум 6 символів">
            </div>
            <button class="btn primary" style="width:100%;margin-top:8px">${isReg?'Зареєструватися':'Увійти'}
            </button>
            </form>
            <div class="auth-switch">${isReg?'Вже маєш акаунт?':'Ще не маєш акаунта?'} 
            <button class="text-button" data-auth="${isReg?'login':'register'}">${isReg?'Увійти':'Зареєструватися'}
            </button>
            </div>
            <div class="notice">
            <b>Демо-доступ для перевірки макета
            </b>
            <br>Користувач: 
            <code>user@example.com
            </code> / 
            <code>user123
            </code>
            <br>Адміністратор: 
            <code>admin@gamenest.local
            </code> / 
            <code>admin123
            </code>
            <br>
            <span class="small">Це демонстраційна авторизація у браузері, не використовуй реальний пароль.
            </span>
            </div>
            </section>
            </main>
            </div>`;
    bind();
    $('#authForm').addEventListener('submit',
    e=>{
        e.preventDefault();
        const email=$('#email').value.trim().toLowerCase(),
        password=$('#password').value;
        let u;
        if(isReg){
            if(db.users.some(x=>x.email.toLowerCase()===email)){
                toast('Акаунт з такою поштою вже існує.');
                return
            }
        u={
            id:'u'+Date.now(),
            name:$('#name').value.trim(),
            email,
            password,
            role:'user'
        }
    ;
    db.users.push(u);
    db.libraries[u.id]={
    }
;
db.lists[u.id]=[];
}
else{
    u=db.users.find(x=>x.email.toLowerCase()===email&&x.password===password);
    if(!u){
        toast('Неправильна пошта або пароль.');
        return
    }
}
db.currentUser=u.id;
save();
toast(isReg?'Акаунт створено!':'Вхід виконано.');
go(u.role==='admin'?'admin':'discover')
}
)
}
function libraryPage(){
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
            <button class="btn primary" data-go="discover">＋ Знайти гру
            </button>
            </div>
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
            <p>Додай першу гру з каталогу та вибери її статус.
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
            <div class="layout-two" style="margin-top:25px">
            <aside class="sidebar">
            <div class="profile-head">
            <div class="avatar">${esc(u.name.slice(0,1).toUpperCase())}
            </div>
            <div>
            <h3 style="margin:0">${esc(u.name)}
            </h3>
            <span class="small muted">${esc(u.email)}
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
    const u=me();
    if(!u||u.role!=='admin')
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
            <tbody>${db.proposals.map(p=>{const owner=db.users.find(x=>x.id===p.userId);return `
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
            <button class="btn" data-publish="${p.id}">Додати в каталог
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
            <h2>Ігри каталогу
            </h2>
            <p class="muted small">Редагуй список доступних ігор.
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
            <h2>Додати нову гру до каталогу
            </h2>
            <p class="muted small">Після збереження гра одразу з’явиться в каталозі для всіх користувачів.
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
            <div class="stat-grid" style="margin:24px 0">
            <div class="stat">
            <span class="muted small">Ігор у каталозі
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
            <button class="chip ${tab==='games'?'active':''}" data-admintab="games">Каталог ігор
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
            toast('Гра з такою назвою вже є в каталозі.');
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
toast('Гру додано до каталогу!');
adminPage('games')
}
)
}
function detail(id){
    const g=gameById(id);
    if(!g){
        go('discover');
        return
    }
const st=library()[id];
layout(`
            <main class="container">
            <button class="btn" data-go="discover">← Назад до каталогу
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
            </button>${me()?.role==='admin'?`
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
function settings(){
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
            <p class="muted">Онови ім’я та налаштування облікового запису.
            </p>
            </div>
            </div>
            <section class="panel" style="max-width:650px">
            <form id="settingsForm" class="form-grid">
            <div class="field wide">
            <label>Ім’я
            </label>
            <input name="name" required value="${esc(u.name)}">
            </div>
            <div class="field wide">
            <label>Електронна пошта
            </label>
            <input value="${esc(u.email)}" disabled>
            </div>
            <div class="wide">
            <button class="btn primary">Зберегти зміни
            </button>
            </div>
            </form>
            </section>
            </main>`,
'profile');
$('#settingsForm').addEventListener('submit',
e=>{
    e.preventDefault();
    u.name=new FormData(e.target).get('name').trim();
    save();
    toast('Профіль оновлено.');
    settings()
}
)
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
}
function bind(){
    $$('[data-go]').forEach(b=>b.addEventListener('click',
    e=>{
        e.preventDefault();
        go(b.dataset.go)
    }
));
$$('[data-auth]').forEach(b=>b.addEventListener('click',
()=>auth(b.dataset.auth)));
$$('[data-action="logout"]').forEach(b=>b.addEventListener('click',
()=>{
    db.currentUser=null;
    save();
    toast('Ти вийшов з акаунта.');
    discover()
}
));
$$('[data-game]').forEach(b=>b.addEventListener('click',
()=>detail(b.dataset.game)));
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
        toast('Така гра вже є в каталозі.');
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
toast('Гру додано до каталогу.');
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
if(!db.games||!db.users){
    db=fresh();
    save()
}
if(me())discover();
else discover();
}
)();
