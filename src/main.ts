/**
 * Entry point for Hestiaverse. Search and filter articles for parents.
 */

function labelToTitle(label: string): string {
  return label
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function getCardLabels(card: Element): string[] {
  const raw = card.getAttribute('data-labels');
  if (!raw) return [];
  return raw.trim().split(/\s+/);
}

/** Build searchable text from card: title + body + labels (space-separated, lowercased). */
function getCardSearchText(card: Element): string {
  const parts: string[] = [];
  const title = card.querySelector('h3');
  if (title) parts.push(title.textContent ?? '');
  const body = card.querySelector('p');
  if (body) parts.push(body.textContent ?? '');
  const labels = getCardLabels(card).join(' ');
  if (labels) parts.push(labels);
  return parts.join(' ').toLowerCase();
}

function initFilters(): void {
  const cards = document.querySelectorAll<HTMLElement>('.card');
  const container = document.getElementById('filter-chips');
  const clearBtn = document.getElementById('filter-clear');
  const countEl = document.getElementById('filter-count');
  const searchInput = document.getElementById('search-input') as HTMLInputElement | null;
  if (!container || !clearBtn || !countEl) return;

  const allLabels = new Set<string>();
  cards.forEach((card) => getCardLabels(card).forEach((l) => allLabels.add(l)));
  const sortedLabels = Array.from(allLabels).sort();

  const selected = new Set<string>();
  const totalCount = cards.length;

  function getSearchQuery(): string {
    return (searchInput?.value ?? '').trim().toLowerCase();
  }

  function applyFilter(): void {
    const searchQuery = getSearchQuery();
    const hasSearch = searchQuery.length > 0;
    const hasTopicFilter = selected.size > 0;
    let visibleCount = 0;

    cards.forEach((card) => {
      const cardLabels = getCardLabels(card);
      const matchesTopic = !hasTopicFilter || cardLabels.some((l) => selected.has(l));
      const matchesSearch = !hasSearch || getCardSearchText(card).includes(searchQuery);
      const visible = matchesTopic && matchesSearch;
      (card as HTMLElement).hidden = !visible;
      if (visible) visibleCount++;
    });

    document.querySelectorAll('.content-section').forEach((section) => {
      const list = section.querySelector('.card-list');
      if (!list) return;
      const visible = list.querySelectorAll('.card:not([hidden])').length;
      (section as HTMLElement).hidden = visible === 0;
    });

    if (hasSearch || hasTopicFilter) {
      countEl!.textContent = `Showing ${visibleCount} of ${totalCount} articles`;
    } else {
      countEl!.textContent = 'Showing all articles';
    }

    sortedLabels.forEach((label) => {
      const btn = document.querySelector(`[data-filter-label="${label}"]`);
      if (btn) {
        btn.setAttribute('aria-pressed', selected.has(label) ? 'true' : 'false');
        btn.classList.toggle('bg-accent', selected.has(label));
        btn.classList.toggle('text-bg', selected.has(label));
        btn.classList.toggle('bg-border', !selected.has(label));
        btn.classList.toggle('text-muted', !selected.has(label));
      }
    });
  }

  sortedLabels.forEach((label) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className =
      'filter-chip font-mono text-[0.8rem] py-1.5 px-3 rounded bg-border text-muted hover:bg-surface-hover transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-bg';
    btn.setAttribute('data-filter-label', label);
    btn.setAttribute('aria-pressed', 'false');
    btn.textContent = labelToTitle(label);
    btn.addEventListener('click', () => {
      if (selected.has(label)) selected.delete(label);
      else selected.add(label);
      applyFilter();
    });
    container.appendChild(btn);
  });

  clearBtn.addEventListener('click', () => {
    selected.clear();
    if (searchInput) searchInput.value = '';
    searchInput?.focus();
    applyFilter();
  });

  if (searchInput) {
    searchInput.addEventListener('input', () => applyFilter());
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        searchInput.value = '';
        searchInput.blur();
        applyFilter();
      }
    });
  }

  applyFilter();
}

document.addEventListener('DOMContentLoaded', () => {
  initFilters();
});
