import * as React from 'react';
import {autobind, debounce} from '@shopify/javascript-utilities/decorators';
import {classNames} from '@shopify/react-utilities/styles';

import {withAppProvider, WithAppProviderProps} from '../AppProvider';
import EventListener from '../EventListener';

import Cell, {Props as CellProps} from './components/Cell';
import Navigation from './components/Navigation';

import * as styles from './DataTable.scss';

export type CombinedProps = Props & WithAppProviderProps;
export type TableRow = Props['headings'] | Props['rows'] | Props['totals'];
export type TableData = string | number | React.ReactNode;
export type SortDirection = 'ascending' | 'descending' | 'none';
export type ColumnContentType = 'text' | 'numeric';

export interface ColumnVisibilityData {
  leftEdge: number;
  rightEdge: number;
  isVisible?: boolean;
}

interface TableMeasurements {
  fixedColumnWidth: number;
  firstVisibleColumnIndex: number;
  tableLeftVisibleEdge: number;
  tableRightVisibleEdge: number;
}

export interface ScrollPosition {
  left?: number;
  top?: number;
}

export interface Props {
  /** List of data types, which determines content alignment for each column. Data types are "text," which aligns left, or "numeric," which aligns right. */
  columnContentTypes: ColumnContentType[];
  /** List of column headings. */
  headings: string[];
  /** List of numeric column totals, highlighted in the table’s header below column headings. Use empty strings as placeholders for columns with no total. */
  totals?: TableData[];
  /** Lists of data points which map to table body rows. */
  rows: TableData[][];
  /** Truncate content in first column instead of wrapping.
   * @default false
   */
  truncate?: boolean;
  /** Content centered in the full width cell of the table footer row. */
  footerContent?: TableData;
  /** List of booleans, which maps to whether sorting is enabled or not for each column. Defaults to false for all columns.  */
  sortable?: boolean[];
  /**
   * The direction to sort the table rows on first click or keypress of a sortable column heading. Defaults to ascending.
   * @default 'ascending'
   */
  defaultSortDirection?: SortDirection;
  /**
   * The index of the heading that the table rows are initially sorted by. Defaults to the first column.
   * @default 0
   */
  initialSortColumnIndex?: number;
  /** Callback fired on click or keypress of a sortable column heading. */
  onSort?(headingIndex: number, direction: SortDirection): void;
}

export interface State {
  collapsed: boolean;
  columnVisibilityData: ColumnVisibilityData[];
  previousColumn?: ColumnVisibilityData;
  currentColumn?: ColumnVisibilityData;
  sorted?: boolean;
  sortedColumnIndex?: number;
  sortDirection?: SortDirection;
  heights: number[];
  fixedColumnWidth?: number;
  preservedScrollPosition: ScrollPosition;
  isScrolledFarthestLeft?: boolean;
  isScrolledFarthestRight?: boolean;
}

export class DataTable extends React.PureComponent<CombinedProps, State> {
  state: State = {
    collapsed: false,
    columnVisibilityData: [],
    sorted: this.props.sortable && this.props.sortable.length > 0,
    heights: [],
    preservedScrollPosition: {},
    isScrolledFarthestLeft: true,
    isScrolledFarthestRight: false,
  };

  private dataTable: HTMLElement;
  private scrollContainer: HTMLElement;
  private table: HTMLElement;
  private totalsRowHeading: string;

  constructor(props: CombinedProps) {
    super(props);
    const {translate} = props.polaris.intl;
    this.totalsRowHeading = translate('Polaris.DataTable.totalsRowHeading');
  }

  componentDidMount() {
    // We need to defer the calculation in development so the styles have time to be injected.
    if (process.env.NODE_ENV === 'development') {
      setTimeout(() => {
        this.handleResize();
      }, 10);
    } else {
      this.handleResize();
    }
  }

  render() {
    const {
      columnContentTypes,
      headings,
      totals,
      rows,
      truncate,
      footerContent,
      sortable,
      defaultSortDirection = 'ascending',
      initialSortColumnIndex = 0,
    } = this.props;

    const {
      collapsed,
      columnVisibilityData,
      heights,
      sortedColumnIndex = initialSortColumnIndex,
      sortDirection = defaultSortDirection,
      isScrolledFarthestLeft,
      isScrolledFarthestRight,
    } = this.state;

    const className = classNames(
      styles.DataTable,
      collapsed && styles.collapsed,
      footerContent && styles.hasFooter,
    );

    const wrapperClassName = classNames(
      styles.TableWrapper,
      collapsed && styles.collapsed,
    );

    const footerClassName = classNames(footerContent && styles.TableFoot);

    const footerMarkup = footerContent ? (
      <tfoot className={footerClassName}>
        <tr>{this.renderFooter()}</tr>
      </tfoot>
    ) : null;

    const totalsMarkup = totals ? (
      <tr>{totals.map(this.renderTotals)}</tr>
    ) : null;

    const headingMarkup = (
      <tr>
        {headings.map((heading, headingIndex) => {
          let sortableHeadingProps;
          const id = `heading-cell-${headingIndex}`;

          if (sortable) {
            const isSortable = sortable[headingIndex];
            const isSorted = sortedColumnIndex === headingIndex;
            const direction = isSorted ? sortDirection : 'none';

            sortableHeadingProps = {
              defaultSortDirection,
              sorted: isSorted,
              sortable: isSortable,
              sortDirection: direction,
              onSort: this.defaultOnSort(headingIndex),
            };
          }

          const height = !truncate ? heights[0] : undefined;

          return (
            <Cell
              header
              key={id}
              testID={id}
              height={height}
              content={heading}
              contentType={columnContentTypes[headingIndex]}
              fixed={headingIndex === 0}
              truncate={truncate}
              {...sortableHeadingProps}
            />
          );
        })}
      </tr>
    );

    const bodyMarkup = rows.map(this.defaultRenderRow);
    const style = footerContent
      ? {marginBottom: `${heights[heights.length - 1]}px`}
      : undefined;

    return (
      <div className={wrapperClassName}>
        <Navigation
          columnVisibilityData={columnVisibilityData}
          isScrolledFarthestLeft={isScrolledFarthestLeft}
          isScrolledFarthestRight={isScrolledFarthestRight}
          navigateTableLeft={this.navigateTable('left')}
          navigateTableRight={this.navigateTable('right')}
        />
        <div className={className} ref={this.setDataTable}>
          <div
            className={styles.ScrollContainer}
            ref={this.setScrollContainer}
            style={style}
          >
            <EventListener event="resize" handler={this.handleResize} />
            <EventListener
              capture
              event="scroll"
              handler={this.scrollListener}
            />
            <table className={styles.Table} ref={this.setTable}>
              <thead>
                {headingMarkup}
                {totalsMarkup}
              </thead>
              <tbody>{bodyMarkup}</tbody>
              {footerMarkup}
            </table>
          </div>
        </div>
      </div>
    );
  }

  @autobind
  private setDataTable(dataTable: HTMLDivElement) {
    this.dataTable = dataTable;
  }

  @autobind
  private setScrollContainer(scrollContainer: HTMLDivElement) {
    this.scrollContainer = scrollContainer;
  }

  @autobind
  private setTable(table: HTMLTableElement) {
    this.table = table;
  }

  @autobind
  @debounce()
  private handleResize() {
    const {footerContent, truncate} = this.props;
    const collapsed = this.table.scrollWidth > this.scrollContainer.clientWidth;
    this.scrollContainer.scrollLeft = 0;
    this.setState(
      {
        collapsed,
        heights: [],
        ...this.calculateColumnVisibilityData(collapsed),
      },
      () => {
        if (footerContent || !truncate) {
          this.setHeightsAndScrollPosition();
        }
      },
    );
  }

  @autobind
  private tallestCellHeights() {
    const {footerContent, truncate} = this.props;
    const rows = Array.from(this.table.getElementsByTagName('tr') as NodeListOf<
      HTMLElement
    >);
    let {heights} = this.state;

    if (!truncate) {
      return (heights = rows.map((row) => {
        const fixedCell = (row.childNodes as NodeListOf<HTMLElement>)[0];
        return Math.max(row.clientHeight, fixedCell.clientHeight);
      }));
    }

    if (footerContent) {
      const footerCellHeight = (rows[rows.length - 1].childNodes as NodeListOf<
        HTMLElement
      >)[0].clientHeight;
      heights = [footerCellHeight];
    }

    return heights;
  }

  @autobind
  private resetScrollPosition() {
    const {
      preservedScrollPosition: {left, top},
    } = this.state;
    if (left) {
      this.scrollContainer.scrollLeft = left;
    }
    if (top) {
      window.scrollTo(0, top);
    }
  }

  @autobind
  private setHeightsAndScrollPosition() {
    this.setState(
      {heights: this.tallestCellHeights()},
      this.resetScrollPosition,
    );
  }

  @autobind
  private calculateColumnVisibilityData(collapsed: boolean) {
    if (collapsed) {
      const headerCells = this.table.querySelectorAll(
        '[class*=header]',
      ) as NodeListOf<HTMLElement>;
      const collapsedHeaderCells = Array.from(headerCells).slice(1);
      const fixedColumnWidth = headerCells[0].offsetWidth;
      const firstVisibleColumnIndex = collapsedHeaderCells.length - 1;
      const tableLeftVisibleEdge =
        this.scrollContainer.scrollLeft + fixedColumnWidth;
      const tableRightVisibleEdge =
        this.scrollContainer.scrollLeft + this.dataTable.offsetWidth;
      const tableData = {
        fixedColumnWidth,
        firstVisibleColumnIndex,
        tableLeftVisibleEdge,
        tableRightVisibleEdge,
      };

      const columnVisibilityData = collapsedHeaderCells.map(
        measureColumn(tableData),
      );

      const lastColumn = columnVisibilityData[columnVisibilityData.length - 1];

      return {
        fixedColumnWidth,
        columnVisibilityData,
        ...getPrevAndCurrentColumns(tableData, columnVisibilityData),
        isScrolledFarthestLeft: tableLeftVisibleEdge === fixedColumnWidth,
        isScrolledFarthestRight: lastColumn.rightEdge <= tableRightVisibleEdge,
      };
    }

    return {
      columnVisibilityData: [],
      previousColumn: undefined,
      currentColumn: undefined,
    };
  }

  @autobind
  private scrollListener() {
    this.setState({
      ...this.calculateColumnVisibilityData(this.state.collapsed),
    });
  }

  @autobind
  private navigateTable(direction: string) {
    const {currentColumn, previousColumn, fixedColumnWidth} = this.state;

    const handleScroll = () => {
      if (!currentColumn || !previousColumn || !fixedColumnWidth) {
        return;
      }

      this.scrollContainer.scrollLeft =
        direction === 'right'
          ? currentColumn.rightEdge - fixedColumnWidth
          : previousColumn.leftEdge - fixedColumnWidth;

      requestAnimationFrame(() => {
        this.setState({
          ...this.calculateColumnVisibilityData(this.state.collapsed),
        });
      });
    };

    return handleScroll;
  }

  @autobind
  private renderTotals(total: TableData, index: number) {
    const id = `totals-cell-${index}`;
    const {heights} = this.state;
    const {truncate = false} = this.props;

    let content;
    let contentType;

    if (index === 0) {
      content = this.totalsRowHeading;
    }

    if (total !== '' && index > 0) {
      contentType = 'numeric';
      content = total;
    }

    return (
      <Cell
        total
        fixed={index === 0}
        testID={id}
        key={id}
        height={heights[1]}
        content={content}
        contentType={contentType}
        truncate={truncate}
      />
    );
  }

  @autobind
  private defaultRenderRow(row: TableData[], index: number) {
    const className = classNames(styles.TableRow);
    const {
      columnContentTypes,
      totals,
      footerContent,
      truncate = false,
    } = this.props;
    const {heights} = this.state;
    const bodyCellHeights = totals ? heights.slice(2) : heights.slice(1);

    if (footerContent) {
      bodyCellHeights.pop();
    }

    return (
      <tr key={`row-${index}`} className={className}>
        {row.map((content: CellProps['content'], cellIndex: number) => {
          const id = `cell-${cellIndex}-row-${index}`;

          return (
            <Cell
              key={id}
              testID={id}
              height={bodyCellHeights[index]}
              content={content}
              contentType={columnContentTypes[cellIndex]}
              fixed={cellIndex === 0}
              truncate={truncate}
            />
          );
        })}
      </tr>
    );
  }

  @autobind
  private renderFooter() {
    const {heights} = this.state;
    const footerCellHeight = heights[heights.length - 1];

    return (
      <Cell
        footer
        testID="footer-cell"
        height={footerCellHeight}
        content={this.props.footerContent}
        truncate={this.props.truncate}
      />
    );
  }

  @autobind
  private defaultOnSort(headingIndex: number) {
    const {
      onSort,
      truncate,
      defaultSortDirection = 'ascending',
      initialSortColumnIndex,
    } = this.props;
    const {
      sortDirection,
      sortedColumnIndex = initialSortColumnIndex,
    } = this.state;
    let newSortDirection = defaultSortDirection;

    if (sortedColumnIndex === headingIndex) {
      newSortDirection =
        sortDirection === 'ascending' ? 'descending' : 'ascending';
    }

    const handleSort = () => {
      this.setState(
        {
          sorted: true,
          sortDirection: newSortDirection,
          sortedColumnIndex: headingIndex,
        },
        () => {
          if (onSort) {
            onSort(headingIndex, newSortDirection);

            if (!truncate) {
              const preservedScrollPosition = {
                left: this.scrollContainer.scrollLeft,
                top: window.scrollY,
              };

              this.setState({preservedScrollPosition});
              this.handleResize();
            }
          }
        },
      );
    };

    return handleSort;
  }
}

function measureColumn(tableData: TableMeasurements) {
  return function(column: HTMLElement, index: number) {
    const {
      firstVisibleColumnIndex,
      tableLeftVisibleEdge: tableStart,
      tableRightVisibleEdge: tableEnd,
      fixedColumnWidth,
    } = tableData;

    const leftEdge = column.offsetLeft + fixedColumnWidth;
    const rightEdge = leftEdge + column.offsetWidth;
    const isVisibleLeft = isEdgeVisible(leftEdge, tableStart, tableEnd);
    const isVisibleRight = isEdgeVisible(rightEdge, tableStart, tableEnd);
    const isVisible = isVisibleLeft || isVisibleRight;

    if (isVisible) {
      tableData.firstVisibleColumnIndex = Math.min(
        firstVisibleColumnIndex,
        index,
      );
    }

    return {leftEdge, rightEdge, isVisible};
  };
}

function isEdgeVisible(position: number, start: number, end: number) {
  const minVisiblePixels = 30;

  return (
    position >= start + minVisiblePixels && position <= end - minVisiblePixels
  );
}

function getPrevAndCurrentColumns(
  tableData: TableMeasurements,
  columnData: State['columnVisibilityData'],
) {
  const {firstVisibleColumnIndex} = tableData;
  const previousColumnIndex = Math.max(firstVisibleColumnIndex - 1, 0);
  const previousColumn = columnData[previousColumnIndex];
  const currentColumn = columnData[firstVisibleColumnIndex];

  return {previousColumn, currentColumn};
}

export default withAppProvider<Props>()(DataTable);
