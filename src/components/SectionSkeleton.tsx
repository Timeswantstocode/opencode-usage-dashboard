import type { SectionId } from '@/components/Shell';
import s from './SectionSkeleton.module.css';

/** A single muted bar used to suggest a line of text without rendering any. */
function Bar({ height = 10, width = '100%' }: { height?: number; width?: string | number }) {
  return <span className={s.bar} style={{ height, width }} />;
}

function ChartPanel({ small = false }: { small?: boolean }) {
  return (
    <div className={`${s.panel} ${small ? s.smallPanel : s.chartPanel}`}>
      <div className={small ? s.smallHead : s.chartHead}>
        <Bar height={small ? 18 : 20} width={small ? '38%' : '30%'} />
        <Bar height={8} width={small ? '46%' : '22%'} />
        <Bar height={8} width={small ? '34%' : '18%'} />
      </div>
      <div className={s.chartBody}>
        <span className={s.chartShape} />
      </div>
    </div>
  );
}

function TableRows({
  rows,
  density,
  footer = false,
}: {
  rows: number;
  density: 'compact' | 'models' | 'projects' | 'sessions';
  footer?: boolean;
}) {
  return (
    <div className={s.table}>
      <div className={`${s.tableHead} ${s[density]}`}>
        <Bar height={8} width="72%" />
        <Bar height={8} width="64%" />
        <Bar height={8} width="56%" />
        <Bar height={8} width="60%" />
        <Bar height={8} width="52%" />
      </div>
      <div className={s.tableBody}>
        {Array.from({ length: rows }, (_, row) => (
          <div className={`${s.tableRow} ${s[density]}`} key={row}>
            <Bar height={density === 'compact' ? 10 : 12} width={`${72 - (row % 4) * 9}%`} />
            <Bar height={8} width={`${58 + (row % 3) * 8}%`} />
            <Bar height={8} width={`${44 + (row % 5) * 6}%`} />
            <Bar height={8} width={`${52 + (row % 2) * 8}%`} />
            <Bar height={8} width={`${40 + (row % 4) * 5}%`} />
          </div>
        ))}
      </div>
      {footer ? (
        <div className={s.tableFoot}>
          <Bar height={8} width={128} />
          <Bar height={8} width={72} />
        </div>
      ) : null}
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <>
      <div className={s.top}>
        <div className={s.live}>
          <span className={s.liveDot} />
          <span className={s.liveLine} style={{ width: 48 }} />
          <span className={s.liveLine} style={{ width: 110 }} />
          <span className={s.liveLine} style={{ width: 84 }} />
          <span className={s.liveLine} style={{ width: 122 }} />
        </div>
        <div className={s.kpis}>
          {Array.from({ length: 12 }, (_, cell) => (
            <div className={s.kpi} key={cell}>
              <span className={s.kpiLabel} />
              <span className={s.kpiValue} />
              <span className={s.kpiSub} />
            </div>
          ))}
        </div>
      </div>
      <ChartPanel />
      <div className={s.when}>
        <div className={s.duo}>
          <ChartPanel small />
          <ChartPanel small />
        </div>
        <div className={s.noteBar}>
          <Bar height={10} width="64%" />
        </div>
      </div>
      <div className={`${s.panel} ${s.activity}`}>
        <div className={s.activityHead}>
          <Bar height={20} width="26%" />
          <Bar height={8} width="14%" />
        </div>
        <div className={s.chartBody}>
          <span className={s.chartShape} />
        </div>
      </div>
    </>
  );
}

function TrendsSkeleton() {
  return (
    <>
      <div className={s.panel}>
        <div className={s.titleHead}>
          <span className={s.titleLines}>
            <Bar height={10} width={132} />
            <Bar height={24} width={272} />
          </span>
          <Bar height={8} width={164} />
        </div>
        <div className={s.rangeBar}>
          <Bar height={8} width="46%" />
        </div>
        <div className={s.compareRow}>
          <div className={s.periodCol}>
            <Bar height={20} width="68%" />
            <Bar height={10} width="44%" />
          </div>
          <div className={s.metrics}>
            {Array.from({ length: 3 }, (_, metric) => (
              <div className={s.metric} key={metric}>
                <Bar height={10} width="42%" />
                <Bar height={22} width="76%" />
                <Bar height={10} width="34%" />
                <Bar height={10} width="54%" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={s.splitWide}>
        <ChartPanel />
        <ChartPanel />
      </div>

      <div className={s.panel}>
        <div className={s.titleHead}>
          <span className={s.titleLines}>
            <Bar height={10} width={120} />
            <Bar height={24} width={224} />
            <Bar height={8} width={252} />
          </span>
          <Bar height={10} width={112} />
        </div>
        <TableRows rows={8} density="compact" footer />
      </div>
    </>
  );
}

function ProjectsSkeleton() {
  return (
    <>
      <div className={s.panel}>
        <div className={s.pageHead}>
          <Bar height={10} width="38%" />
        </div>
        <div className={s.summaryGrid}>
          {Array.from({ length: 3 }, (_, cell) => (
            <div className={s.summaryCell} key={cell}>
              <Bar height={10} width={`${58 - cell * 8}%`} />
              <Bar height={18} width={`${52 + cell * 9}%`} />
            </div>
          ))}
        </div>
      </div>

      <div className={`${s.panel} ${s.detail}`}>
        <div className={s.detailHead}>
          <span className={s.detailTitle}>
            <Bar height={9} width={64} />
            <Bar height={24} width={180} />
          </span>
          <Bar height={28} width={82} />
        </div>
        <div className={s.detailStats}>
          {Array.from({ length: 5 }, (_, cell) => (
            <div className={s.detailCell} key={cell}>
              <Bar height={9} width="64%" />
              <Bar height={15} width="48%" />
            </div>
          ))}
        </div>
        <div className={s.detailBody}>
          <span className={s.chartShape} />
        </div>
      </div>

      <div className={s.panel}>
        <TableRows rows={8} density="projects" />
      </div>
    </>
  );
}

function ModelsSkeleton() {
  return (
    <div className={s.panel}>
      <div className={`${s.pageHead} ${s.modelsHead}`}>
        <Bar height={10} width="46%" />
        <Bar height={18} width={136} />
      </div>
      <TableRows rows={10} density="models" />
    </div>
  );
}

function SessionsSkeleton() {
  return (
    <div className={s.panel}>
      <div className={`${s.pageHead} ${s.sessionsHead}`}>
        <Bar height={10} width="42%" />
        <Bar height={28} width={86} />
      </div>
      <div className={s.filters}>
        <div className={s.field}>
          <Bar height={9} width={44} />
          <span className={s.input} />
        </div>
        <div className={s.field}>
          <Bar height={9} width={48} />
          <span className={s.input} style={{ width: 180 }} />
        </div>
      </div>
      <TableRows rows={10} density="sessions" footer />
    </div>
  );
}

function ToolsSkeleton() {
  return (
    <>
      <div className={s.panel}>
        <div className={s.toolHead}>
          <span className={s.titleLines}>
            <Bar height={24} width={196} />
            <Bar height={8} width={280} />
          </span>
          <Bar height={10} width={124} />
        </div>
        <div className={s.toolStats}>
          {Array.from({ length: 6 }, (_, cell) => (
            <div className={s.toolStat} key={cell}>
              <Bar height={9} width="58%" />
              <Bar height={18} width="46%" />
              <Bar height={8} width="66%" />
            </div>
          ))}
        </div>
      </div>

      <div className={s.toolsSplit}>
        <div className={`${s.panel} ${s.toolPanel}`}>
          <div className={s.toolPanelHead}>
            <Bar height={9} width={88} />
            <Bar height={8} width={156} />
          </div>
          <div className={s.chartBody}>
            <span className={s.chartShape} />
          </div>
        </div>
        <div className={`${s.panel} ${s.toolPanel}`}>
          <div className={s.toolPanelHead}>
            <Bar height={9} width={92} />
            <Bar height={8} width={196} />
          </div>
          <div className={s.chartBody}>
            <span className={s.chartShape} />
          </div>
        </div>
      </div>
    </>
  );
}

function RecordsSkeleton() {
  return (
    <>
      <div className={s.shareCard}>
        <span className={s.shareTop}>
          <Bar height={12} width={108} />
          <Bar height={8} width={132} />
        </span>
        <span className={s.shareBody}>
          <span className={s.shareHero} />
          <span className={s.shareHero} />
        </span>
      </div>

      <div className={s.recordGrid}>
        {Array.from({ length: 4 }, (_, cell) => (
          <div className={s.recordCell} key={cell}>
            <Bar height={9} width="56%" />
            <Bar height={34} width="42%" />
            <Bar height={9} width="68%" />
          </div>
        ))}
      </div>

      <div className={s.ledger}>
        {Array.from({ length: 8 }, (_, row) => (
          <div className={s.ledgerRow} key={row}>
            <Bar height={9} width={`${62 - (row % 3) * 8}%`} />
            <Bar height={9} width={56} />
            <Bar height={9} width={38} />
          </div>
        ))}
      </div>
    </>
  );
}

/** Section-shaped first-load placeholder: no text, only panel and element blocks. */
export function SectionSkeleton({ section }: { section: SectionId }) {
  const records = section === 'records';

  return (
    <div
      className={records ? `${s.root} ${s.recordsRoot}` : s.root}
      aria-busy="true"
      aria-label="Loading usage data"
    >
      {section === 'overview' ? <OverviewSkeleton /> : null}
      {section === 'trends' ? <TrendsSkeleton /> : null}
      {section === 'projects' ? <ProjectsSkeleton /> : null}
      {section === 'models' ? <ModelsSkeleton /> : null}
      {section === 'sessions' ? <SessionsSkeleton /> : null}
      {section === 'tools' ? <ToolsSkeleton /> : null}
      {section === 'records' ? <RecordsSkeleton /> : null}
    </div>
  );
}
