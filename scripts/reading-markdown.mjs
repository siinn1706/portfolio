import { satteri } from '@astrojs/markdown-satteri';
import { load } from 'cheerio';

// Enhance the existing processor's final HTML; its heading IDs and image
// metadata stay authoritative. No additional Markdown engine is installed.
export function enhanceReadingHtml(html, locale = 'vi') {
  const $ = load(html, {}, false);
  const vi = locale === 'vi';
  let section = vi ? 'Bảng dữ liệu' : 'Data table';
  $('h2, h3, table').each((_, element) => {
    const node = $(element);
    if (node.is('table')) {
      if (!node.children('caption').length) node.prepend($('<caption>').text(section));
      node.find('thead th').attr('scope', 'col');
      node.find('tbody tr').each((_, row) => {
        const first = $(row).children('td, th').first();
        if (first.length) { first[0].tagName = 'th'; first.attr('scope', 'row'); }
      });
      const caption = node.children('caption').text();
      node.wrap($('<div class="table-scroll" role="region" tabindex="0">').attr('aria-label', caption));
      node.parent().before($('<p class="table-hint">').text(vi
        ? '← → Cuộn ngang để xem thêm cột nếu cần. Có thể dùng phím mũi tên khi chọn bảng.'
        : '← → Scroll sideways for more columns if needed. Focus the table to use arrow keys.'));
      return;
    }
    section = node.text();
    const id = node.attr('id');
    if (!id) return;
    const title = node.text();
    const anchor = $('<a class="heading-link">').attr('href', `#${id}`);
    anchor.append(node.contents());
    anchor.append('<span class="heading-mark" aria-hidden="true"> #</span>');
    node.append(anchor);
    node.wrap('<div class="heading-group">');
    node.after($('<button type="button" class="copy-heading" hidden>').attr({
      'data-copy-fragment': id,
      'aria-label': `${vi ? 'Sao chép liên kết tới' : 'Copy link to'} ${title}`,
    }).text(vi ? 'Chép link' : 'Copy link'));
    node.parent().append('<span class="copy-feedback" data-copy-feedback aria-hidden="true"></span>');
  });
  return $.html();
}

export function readingProcessor() {
  const processor = satteri();
  return {
    name: 'open-desk-reading',
    options: processor.options,
    async createRenderer(shared) {
      const renderer = await processor.createRenderer(shared);
      return { async render(content, options) {
        const result = await renderer.render(content, options);
        const locale = options?.frontmatter?.locale;
        return { ...result, code: enhanceReadingHtml(result.code, locale === 'en' ? 'en' : 'vi') };
      } };
    },
  };
}
