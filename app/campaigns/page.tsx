import type { ReactNode } from 'react'
import { ArrowDown, ArrowUp, Megaphone, Plus, Search, Star, Target, TrendingUp, Wallet } from 'lucide-react'
import BosShell from '@/components/BosShell'
import { requireOpsAccess } from '@/lib/auth'

const campaigns = [
  { name: 'Summer Glow Launch', platform: 'Meta', spend: '4,200', revenue: '18,900', roas: 4.5, status: 'Active', ends: '12 Jun' },
  { name: 'TikTok Serum Viral Push', platform: 'TikTok', spend: '3,100', revenue: '13,020', roas: 4.2, status: 'Active', ends: '5 Jun' },
  { name: 'Lip Oil Retargeting', platform: 'Meta', spend: '1,500', revenue: '3,900', roas: 2.6, status: 'Active', ends: '20 Jun' },
  { name: 'Google Search - Skincare', platform: 'Google', spend: '1,020', revenue: '1,480', roas: 1.5, status: 'Review', ends: '8 Jun' },
]

const platforms = [
  { name: 'Meta (IG/FB)', share: 58, spend: '5,700', roas: '4.0x', color: 'var(--c-instagram)' },
  { name: 'TikTok', share: 31, spend: '3,100', roas: '4.2x', color: 'var(--c-tiktok)' },
  { name: 'Google', share: 11, spend: '1,020', roas: '1.5x', color: 'var(--c-website)' },
]

const influencers = [
  { name: '@nour.beauty', meta: '182k followers', orders: 34, revenue: '9,200', roi: '5.1x' },
  { name: '@selma_glow', meta: '94k followers', orders: 21, revenue: '5,040', roi: '3.4x' },
  { name: '@maquillage.maroc', meta: '310k followers', orders: 18, revenue: '4,320', roi: '1.9x' },
]

export default async function CampaignsPage() {
  await requireOpsAccess()

  return (
    <BosShell active="campaigns" title="Campaigns" crumb="Growth">
      <div className="page-inner page-wide">
        <div className="page-head">
          <div>
            <h1>Campaigns & Ads</h1>
            <div className="sub">Ad spend, ROAS & influencer performance - June 2026</div>
          </div>
          <div className="spacer"></div>
          <div className="seg"><button className="active">7D</button><button>30D</button><button>QTD</button></div>
          <button className="btn primary"><Plus />New campaign</button>
        </div>

        <div className="cstat-row">
          <Metric icon={<Wallet />} tone="red" title="Ad spend - 7D" value="9,820" unit="MAD" trend="+12%" />
          <Metric icon={<TrendingUp />} tone="green" title="Attributed revenue" value="37,300" unit="MAD" trend="+18%" />
          <Metric icon={<Megaphone />} tone="rose" title="Blended ROAS" value="3.8" unit="x" trend="+0.4" />
          <Metric icon={<Target />} tone="blue" title="Cost per order" value="71" unit="MAD" trend="-6 MAD" down />
        </div>

        <div className="camp-grid">
          <div className="grid">
            <div className="panel">
              <div className="panel-head">
                <h3>Spend vs attributed revenue</h3>
                <div className="row gap14 chart-legend">
                  <span className="row gap6 fs12 tx-mid"><span className="legend-line green"></span>Revenue</span>
                  <span className="row gap6 fs12 tx-mid"><span className="legend-line red"></span>Spend</span>
                </div>
                <div className="spacer"></div>
                <span className="hint">last 30 days</span>
              </div>
              <div className="panel-pad">
                <StaticArea />
                <div className="chart-label-row"><span>6 May</span><span>16 May</span><span>26 May</span><span>4 Jun</span></div>
              </div>
            </div>

            <div className="panel">
              <div className="panel-head"><h3>Active campaigns</h3><div className="spacer"></div><span className="badge green"><span className="bdot"></span>3 running</span></div>
              <div className="table-scroll">
                <table className="tbl">
                  <thead><tr><th>Campaign</th><th>Platform</th><th className="r">Spend</th><th className="r">Revenue</th><th>ROAS</th><th>Status</th><th className="r">Ends</th></tr></thead>
                  <tbody>
                    {campaigns.map((campaign) => (
                      <tr key={campaign.name}>
                        <td className="t-strong">{campaign.name}</td>
                        <td><span className="badge">{campaign.platform}</span></td>
                        <td className="r num neg">-{campaign.spend}</td>
                        <td className="r num pos">+{campaign.revenue}</td>
                        <td><span className="row gap8"><span className="roas-bar"><span style={{ width: `${Math.min(100, campaign.roas / 5 * 100)}%`, background: campaign.roas >= 4 ? 'var(--green)' : campaign.roas >= 2.5 ? 'var(--amber)' : 'var(--red)' }}></span></span><span className="num fs12 fw600">{campaign.roas}x</span></span></td>
                        <td><span className={`badge ${campaign.status === 'Active' ? 'green' : 'amber'}`}>{campaign.status}</span></td>
                        <td className="r"><span className="fs12 tx-lo mono">{campaign.ends}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="grid">
            <div className="panel">
              <div className="panel-head"><h3>By platform</h3><div className="spacer"></div><span className="hint">spend share</span></div>
              <div className="panel-pad">
                {platforms.map((platform) => (
                  <div key={platform.name} className="platform-line">
                    <div className="between mb8"><span className="row gap8"><span className="channel-dot" style={{ background: platform.color }}></span><span className="fw500 fs12">{platform.name}</span></span><span className="num fs12">{platform.spend} MAD</span></div>
                    <div className="bar"><span style={{ width: `${platform.share}%`, background: platform.color }}></span></div>
                    <div className="between mt4"><span className="fs11 tx-lo">{platform.share}% of spend</span><span className="num fs11 pos">{platform.roas} ROAS</span></div>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel">
              <div className="panel-head"><Star className="panel-head-icon" /><h3>Influencer ROI</h3></div>
              {influencers.map((person) => (
                <div key={person.name} className="camp-card">
                  <div className="between mb8">
                    <span className="row gap8"><span className="avatar a small">{person.name[1].toUpperCase()}</span><span className="cellstack"><span className="t-strong fs12">{person.name}</span><span className="t-sub">{person.meta}</span></span></span>
                    <span className="badge green">{person.roi} ROI</span>
                  </div>
                  <div className="row gap20"><span className="mini-stat"><span className="ms-l">Orders</span><span className="ms-v">{person.orders}</span></span><span className="mini-stat"><span className="ms-l">Revenue</span><span className="ms-v pos">{person.revenue}</span></span></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </BosShell>
  )
}

function Metric({ icon, tone, title, value, unit, trend, down }: { icon: ReactNode; tone: string; title: string; value: string; unit: string; trend: string; down?: boolean }) {
  return (
    <div className="panel kpi">
      <div className="kpi-top"><div className="kpi-ico" style={{ background: `var(--${tone}-bg)`, color: tone === 'rose' ? 'var(--rose-bright)' : `var(--${tone})` }}>{icon}</div><span className="kpi-title">{title}</span></div>
      <div className="kpi-val"><span>{value}</span><span className="cur">{unit}</span></div>
      <div className="kpi-meta"><span className={`delta ${down ? 'down' : 'up'}`}>{down ? <ArrowDown /> : <ArrowUp />}{trend}</span></div>
    </div>
  )
}

function StaticArea() {
  return (
    <svg className="area-chart" width="100%" height="200" viewBox="0 0 760 200" preserveAspectRatio="none" fill="none">
      {[0, 1, 2, 3, 4].map((line) => <line key={line} x1="0" y1={20 + line * 40} x2="760" y2={20 + line * 40} stroke="var(--line-soft)" />)}
      <path d="M0 150 L80 132 L160 140 L240 110 L320 120 L400 88 L480 96 L560 62 L640 72 L760 44" stroke="var(--green)" strokeWidth="2.2" fill="none" />
      <path d="M0 172 L80 160 L160 166 L240 145 L320 150 L400 128 L480 135 L560 112 L640 119 L760 104" stroke="var(--red)" strokeWidth="2" fill="none" />
    </svg>
  )
}
