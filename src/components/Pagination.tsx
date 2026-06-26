export function Pagination({
  category,
  currentPage,
  pageCount,
  tag,
}: {
  category: string | null;
  currentPage: number;
  pageCount: number;
  tag: string | null;
}) {
  const pageNumbers = Array.from({ length: pageCount }, (_, index) => index + 1);
  const pageHref = (page: number) => {
    const params = new URLSearchParams();
    if (category) {
      params.set('category', category);
    }
    if (tag) {
      params.set('tag', tag);
    }
    const queryString = params.toString();
    return `/posts/page/${page}${queryString ? `?${queryString}` : ''}`;
  };

  return (
    <nav className="pagination" aria-label="文章分页">
      <a aria-disabled={currentPage === 1} href={pageHref(Math.max(1, currentPage - 1))}>
        上一页
      </a>
      <div>
        {pageNumbers.map((page) => (
          <a aria-current={page === currentPage ? 'page' : undefined} href={pageHref(page)} key={page}>
            {page}
          </a>
        ))}
      </div>
      <a aria-disabled={currentPage === pageCount} href={pageHref(Math.min(pageCount, currentPage + 1))}>
        下一页
      </a>
    </nav>
  );
}

export function SimplePagination({
  basePath,
  currentPage,
  pageCount,
}: {
  basePath: string;
  currentPage: number;
  pageCount: number;
}) {
  const pageNumbers = Array.from({ length: pageCount }, (_, index) => index + 1);
  const pageHref = (page: number) => `${basePath}/${page}`;

  return (
    <nav className="pagination" aria-label="分页">
      <a aria-disabled={currentPage === 1} href={pageHref(Math.max(1, currentPage - 1))}>
        上一页
      </a>
      <div>
        {pageNumbers.map((page) => (
          <a aria-current={page === currentPage ? 'page' : undefined} href={pageHref(page)} key={page}>
            {page}
          </a>
        ))}
      </div>
      <a aria-disabled={currentPage === pageCount} href={pageHref(Math.min(pageCount, currentPage + 1))}>
        下一页
      </a>
    </nav>
  );
}
