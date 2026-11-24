import { Children, Fragment, cloneElement, isValidElement } from 'react';
import type { CSSProperties, ReactElement, ReactNode, TableHTMLAttributes, TdHTMLAttributes } from 'react';

export type SummaryTableOrientation = 'children-columns' | 'children-rows';
type ElementProps = { children?: ReactNode };
type Cell = ReactElement<TdHTMLAttributes<HTMLTableCellElement>>;

const elements = (children: ReactNode): ReactElement<ElementProps>[] => {
  const result: ReactElement<ElementProps>[] = [];
  Children.forEach(children, child => {
    if (!isValidElement<ElementProps>(child)) return;
    if (child.type === Fragment) result.push(...elements(child.props.children));
    else result.push(child);
  });
  return result;
};

/** 元のセル・イベントを共有し、表示方向だけを入れ替える。 */
export function SummaryTableLayout({ orientation, children: table }: {
  orientation: SummaryTableOrientation;
  children: ReactElement<TableHTMLAttributes<HTMLTableElement>>;
}) {
  if (orientation === 'children-columns') return table;
  const rows = elements(table.props.children)
    .filter(section => section.type === 'thead' || section.type === 'tbody')
    .flatMap(section => elements(section.props.children))
    .map(row => elements(row.props.children) as Cell[]);
  if (!rows.length) return table;
  const headerCount = elements(table.props.children).filter(section => section.type === 'thead')
    .reduce((count, section) => count + elements(section.props.children).length, 0);
  const widths = rows.map((_, index) => index === 0 ? 120 : index === 1 ? 80 : index < headerCount ? 56 : 48);

  const cell = (original: Cell | undefined, column: number, header: boolean) => {
    if (!original) return <td key={column} />;
    const { style, className, children, ...props } = original.props;
    const cleanClass = (className || '').split(/\s+/).filter(token =>
      !/^(sticky|relative|top-|left-|z-|w-20|shadow|px-)/.test(token)).join(' ');
    const nextStyle: CSSProperties = { ...style, top: undefined, left: undefined, height: header ? column === 0 ? 72 : 64 : 44 };
    let content = children;
    if (!header && column === 0) {
      content = elements(children).map((element, index) => cloneElement(element as ReactElement<{ style?: CSSProperties }>, {
        key: index, style: { writingMode: 'horizontal-tb', whiteSpace: 'normal', lineHeight: 1.5, textAlign: 'left' },
      }));
    }
    if (header && column >= headerCount) {
      const date = Children.toArray(children).join('').match(/^(\d+)日\s*\((.)\)$/);
      if (date) content = <><span className="block leading-relaxed">{date[1]}日</span><span className="block leading-relaxed">({date[2]})</span></>;
    }
    const position = header ? `sticky top-0 ${column === 0 ? 'left-0 z-40' : 'z-30'}` : column === 0 ? 'sticky left-0 z-20' : 'relative z-0';
    const padding = column === 0 ? 'px-2' : column < headerCount ? 'px-1' : '';
    if (header || column === 0) return <th {...props} key={column} scope={header ? 'col' : 'row'} className={`${cleanClass} ${position} ${padding}`} style={nextStyle}>{content}</th>;
    return <td {...props} key={column} className={`${cleanClass} ${position} ${padding}`} style={nextStyle}>{content}</td>;
  };
  return <table {...table.props} data-table-orientation="children-rows" style={{ ...table.props.style, width: widths.reduce((sum, width) => sum + width, 0) }}>
    <colgroup>{widths.map((width, index) => <col key={index} style={{ width }} />)}</colgroup>
    <thead><tr>{rows.map((row, column) => cell(row[0], column, true))}</tr></thead>
    <tbody>{rows[0].slice(1).map((_, childIndex) => <tr key={rows[0][childIndex + 1].key ?? childIndex}>
      {rows.map((row, column) => cell(row[childIndex + 1], column, false))}
    </tr>)}</tbody>
  </table>;
}
