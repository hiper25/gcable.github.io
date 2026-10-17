const PAGE_SIZE = 60;
let elements;
let activeSession;
let backdropSession;

function normalized(value) {
    return String(value ?? '').normalize('NFKC').toLocaleLowerCase().trim();
}

function getElements() {
    if (elements) return elements;
    const dialog = document.getElementById('filter-picker');
    elements = {
        dialog,
        title: document.getElementById('filter-picker-title'),
        description: document.getElementById('filter-picker-description'),
        close: document.getElementById('filter-picker-close'),
        search: document.getElementById('filter-picker-search'),
        views: document.getElementById('filter-picker-views'),
        status: document.getElementById('filter-picker-status'),
        scroll: document.getElementById('filter-picker-scroll'),
        options: document.getElementById('filter-picker-options'),
        more: document.getElementById('filter-picker-more')
    };
    elements.close.addEventListener('click', () => closeSession(activeSession));
    dialog.addEventListener('cancel', event => {
        event.preventDefault();
        closeSession(activeSession);
    });
    dialog.addEventListener('keydown', event => {
        if (event.key !== 'Tab') return;
        const targets = Array.from(dialog.querySelectorAll('button,input,[tabindex]'))
            .filter(element => element.tabIndex >= 0 && !element.disabled && element.getClientRects().length);
        const first = targets[0], last = targets.at(-1);
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault(); last.focus({preventScroll: true});
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault(); first.focus({preventScroll: true});
        }
    });
    // A queued close event from an earlier opening must not affect a new one.
    dialog.addEventListener('close', () => {
        if (!dialog.open) closeSession(activeSession);
    });
    dialog.addEventListener('pointerdown', event => {
        backdropSession = event.target === dialog && outsideDialog(event) ? activeSession : undefined;
    });
    dialog.addEventListener('click', event => {
        if (backdropSession === activeSession && event.target === dialog && outsideDialog(event)) {
            closeSession(activeSession);
        }
        backdropSession = undefined;
    });
    elements.search.addEventListener('input', () => {
        if (activeSession && !activeSession.pending) filterOptions(activeSession);
    });
    elements.views.addEventListener('click', event => {
        const button = event.target.closest('button[data-view-index]');
        const session = activeSession;
        if (!button || !session || session.pending) return;
        session.viewIndex = Number(button.dataset.viewIndex);
        updateViews(session);
        filterOptions(session);
    });
    elements.options.addEventListener('click', event => {
        const button = event.target.closest('button[data-option-index]');
        const session = activeSession;
        if (!button || !session || session.pending) return;
        chooseOption(session, session.matches[Number(button.dataset.optionIndex)], button);
    });
    elements.more.addEventListener('click', () => {
        if (activeSession && !activeSession.pending) appendOptions(activeSession, true);
    });
    return elements;
}

function outsideDialog(event) {
    const bounds = elements.dialog.getBoundingClientRect();
    return event.clientX < bounds.left || event.clientX > bounds.right ||
        event.clientY < bounds.top || event.clientY > bounds.bottom;
}

function closeSession(session, restoreFocus = true) {
    if (!session || session !== activeSession) return;
    activeSession = undefined;
    backdropSession = undefined;
    session.trigger.setAttribute('aria-expanded', 'false');
    if (elements.dialog.open) elements.dialog.close();
    document.documentElement.classList.remove('picker-open');
    if (restoreFocus && session.trigger.isConnected) session.trigger.focus({preventScroll: true});
}

export function closePicker(restoreFocus = true) {
    closeSession(activeSession, restoreFocus);
}

function setStatus(message, error = false) {
    elements.status.textContent = message;
    elements.status.dataset.error = String(error);
}

function updateViews(session) {
    for (const button of elements.views.children) {
        button.setAttribute('aria-pressed', String(Number(button.dataset.viewIndex) === session.viewIndex));
    }
}

function filterOptions(session) {
    const query = normalized(elements.search.value);
    const terms = query.split(/\s+/).filter(Boolean);
    session.matches = session.views[session.viewIndex].options.filter(option =>
        terms.every(term => option.searchText.includes(term)));
    session.rendered = 0;
    elements.options.replaceChildren();
    elements.scroll.scrollTop = 0;
    appendOptions(session);
}

function appendOptions(session, focusNewOptions = false) {
    const end = Math.min(session.rendered + PAGE_SIZE, session.matches.length);
    const fragment = document.createDocumentFragment();
    for (let index = session.rendered; index < end; index++) {
        const option = session.matches[index];
        const selected = option.value === session.selected;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'picker-option';
        button.dataset.optionIndex = String(index);
        button.setAttribute('aria-pressed', String(selected));
        const copy = document.createElement('span');
        copy.className = 'picker-option-copy';
        const label = document.createElement('span');
        label.className = 'picker-option-label';
        label.textContent = option.label;
        copy.append(label);
        if (option.detail) {
            const detail = document.createElement('span');
            detail.className = 'picker-option-detail';
            detail.textContent = option.detail;
            copy.append(detail);
        }
        const mark = document.createElement('span');
        mark.className = 'picker-option-mark';
        mark.textContent = selected ? '已选' : '';
        button.append(copy, mark);
        fragment.append(button);
    }
    const firstNewOption = fragment.firstElementChild;
    elements.options.append(fragment);
    session.rendered = end;
    elements.more.hidden = end >= session.matches.length;
    elements.more.textContent = `加载更多（还有 ${session.matches.length - end} 项）`;
    setStatus(session.matches.length ? `共 ${session.matches.length} 项，已显示 ${end} 项` : '没有匹配的选项，请尝试其他关键词。');
    if (focusNewOptions && firstNewOption) {
        firstNewOption.focus({preventScroll: true});
        elements.scroll.scrollTop += firstNewOption.getBoundingClientRect().top - elements.scroll.getBoundingClientRect().top - elements.scroll.clientTop;
    }
}

function setPending(session, pending) {
    session.pending = pending;
    elements.options.setAttribute('aria-busy', String(pending));
    elements.search.disabled = pending;
    elements.more.disabled = pending;
    for (const button of elements.views.children) button.disabled = pending;
    for (const button of elements.options.children) button.disabled = pending;
}

async function chooseOption(session, option, button) {
    if (!option) return;
    setPending(session, true);
    const mark = button.querySelector('.picker-option-mark');
    mark.textContent = '应用中…';
    setStatus(`正在应用：${option.label}…`);
    try {
        const result = await session.onSelect(option.value);
        if (activeSession !== session || !elements.dialog.open) return;
        if (result !== false) {
            closeSession(session);
            return;
        }
        setStatus('选择未完成，已保留此窗口。请重试或选择其他项。', true);
    } catch {
        if (activeSession !== session || !elements.dialog.open) return;
        setStatus('应用选择时发生错误，已保留此窗口。请重试。', true);
    }
    if (activeSession === session && elements.dialog.open) {
        setPending(session, false);
        mark.textContent = option.value === session.selected ? '已选' : '';
        if (document.activeElement === elements.dialog || document.activeElement === document.body) {
            button.focus({preventScroll: true});
        }
    }
}

/**
 * Open the shared in-page chooser. Caller owns trigger text and application state.
 * options: [{value, label, detail?, keywords?}] (string fields).
 * views: optional [{id, label, options}], with the first view active on opening.
 * onSelect(value) may return a Promise; false or rejection keeps this opening visible.
 * Closing does not cancel the caller's work, but stale completions cannot change a later opening.
 */
export function openPicker({trigger, title, description = '', options, views, selected, onSelect}) {
    const ui = getElements();
    if (activeSession) closeSession(activeSession, false);
    const session = {
        trigger,
        selected,
        onSelect,
        pending: false,
        viewIndex: 0,
        rendered: 0,
        matches: [],
        views: (views?.length ? views : [{id: 'all', label: '全部', options}]).map(view => ({
            id: view.id,
            label: view.label,
            options: view.options.map(option => ({
                ...option,
                searchText: normalized([option.value, option.label, option.detail, option.keywords].filter(Boolean).join(' '))
            }))
        }))
    };
    activeSession = session;
    ui.title.textContent = title;
    ui.description.textContent = description;
    ui.search.value = '';
    ui.views.replaceChildren();
    ui.views.hidden = session.views.length < 2;
    session.views.forEach((view, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'picker-view';
        button.dataset.viewIndex = String(index);
        button.textContent = view.label;
        ui.views.append(button);
    });
    updateViews(session);
    filterOptions(session);
    setPending(session, false);
    trigger.setAttribute('aria-expanded', 'true');
    document.documentElement.classList.add('picker-open');
    ui.dialog.showModal();
    ui.search.focus({preventScroll: true});
}
