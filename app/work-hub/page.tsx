'use client'

import { useState } from 'react'
import { BookOpen, Check, FlaskConical, Link as LinkIcon, Plus, StickyNote } from 'lucide-react'
import BosShell from '@/components/BosShell'

const achraf = [
  ['Negotiate Sendit rate for Casablanca zone', true],
  ['Finalize Summer Glow bundle pricing', true],
  ['Restock Glow Serum + Brume Fixante', true],
  ['Review June ad budget allocation', false],
  ['Set up website order webhook', false],
] as const

const marjan = [
  ['Confirm 14 pending WhatsApp orders', true],
  ['Brief @nour.beauty on serum collab', true],
  ['Film 3 TikToks for viral push', false],
  ['Reply to 8 customer support DMs', false],
] as const

const tasks = [
  { title: 'Set up Sendit webhook for live delivery status', priority: 'URGENT', status: 'In progress', owner: 'AM', due: 'Today', link: 'Sendit API' },
  { title: 'Fix 2 products missing cost price', priority: 'URGENT', status: 'To do', owner: 'MH', due: 'Today', link: 'Products' },
  { title: 'Design loyalty points tiers', priority: 'HIGH', status: 'In progress', owner: 'AM', due: '6 Jun' },
  { title: 'Photograph new arrivals for catalog', priority: 'HIGH', status: 'To do', owner: 'MH', due: '7 Jun' },
  { title: 'Reconcile May COD collections', priority: 'MEDIUM', status: 'Blocked', owner: 'AM', due: '8 Jun', link: 'Finance' },
]

export default function WorkHubPage() {
  const [taskFilter, setTaskFilter] = useState<'All' | 'Urgent' | 'In progress' | 'Blocked'>('All')

  const handleDecisionLog = () => {
    alert('Decision log feature coming soon! Continue tracking decisions in the list below.')
  }

  const handleNewTask = () => {
    alert('Task creation feature coming soon! Add tasks to your weekly priorities for now.')
  }

  return (
    <BosShell active="work" title="Work Hub" crumb="Team">
      <div className="page-inner page-wide">
        <div className="page-head">
          <div>
            <h1>Work Hub</h1>
            <div className="sub">Weekly priorities, tasks, decisions & experiments - week of 2 June</div>
          </div>
          <div className="spacer"></div>
          <button className="btn-modern btn-secondary" onClick={handleDecisionLog}><BookOpen className="w-4 h-4" />Decision log</button>
          <button className="btn-modern btn-primary" onClick={handleNewTask}><Plus className="w-4 h-4" />New task</button>
        </div>

        <div className="prio-grid">
          <PriorityPanel name="Achraf" avatar="AM" tone="a" done="3/5 done" items={achraf} />
          <PriorityPanel name="Marjan" avatar="MH" tone="b" done="2/4 done" items={marjan} />
        </div>

        <div className="wh-grid">
          <div className="panel">
            <div className="panel-head">
              <h3>Tasks</h3>
              <div className="row gap6 task-chips">
                <button className={`chip ${taskFilter === 'All' ? 'active' : ''}`} onClick={() => setTaskFilter('All')}>All <span className="ct">12</span></button>
                <button className={`chip ${taskFilter === 'Urgent' ? 'active' : ''}`} onClick={() => setTaskFilter('Urgent')}>Urgent <span className="ct">2</span></button>
                <button className={`chip ${taskFilter === 'In progress' ? 'active' : ''}`} onClick={() => setTaskFilter('In progress')}>In progress <span className="ct">4</span></button>
                <button className={`chip ${taskFilter === 'Blocked' ? 'active' : ''}`} onClick={() => setTaskFilter('Blocked')}>Blocked <span className="ct">1</span></button>
              </div>
            </div>
            {tasks.map((task) => (
              <div key={task.title} className="task-row">
                <span className="pbox"></span>
                <div className="task-main">
                  <div className="row gap8 mb4">
                    <span className={`prio-flag ${task.priority.toLowerCase()}`}>{task.priority}</span>
                    {task.link ? <span className="badge mini-badge"><LinkIcon />{task.link}</span> : null}
                  </div>
                  <span className="fs13 fw500">{task.title}</span>
                </div>
                <span className={`st ${task.status === 'Blocked' ? 'st-failed' : task.status === 'In progress' ? 'st-confirmed' : 'st-pending'}`}><span className="sd"></span>{task.status}</span>
                <span className={`avatar ${task.owner === 'AM' ? 'a' : 'b'} small`}>{task.owner}</span>
                <span className="fs12 tx-lo mono task-due">{task.due}</span>
              </div>
            ))}
          </div>

          <div className="grid">
            <div className="panel">
              <div className="panel-head"><StickyNote className="panel-head-icon" /><h3>Decision log</h3></div>
              {[
                ['Switch primary courier to Sendit', 'Better Casablanca rates + API tracking', '28 May'],
                ['Hold retail prices through summer', 'Margin healthy at 42%; compete on content not price', '24 May'],
                ['Double down on TikTok over Facebook', 'TikTok ROAS 4.2x vs FB 1.8x', '20 May'],
              ].map(([title, body, date]) => (
                <div key={title} className="dec-item"><div className="between mb4"><span className="fw600 fs13">{title}</span><span className="fs11 tx-faint mono">{date}</span></div><div className="fs12 tx-mid">{body}</div></div>
              ))}
            </div>
            <div className="panel">
              <div className="panel-head"><FlaskConical className="panel-head-icon" /><h3>Growth experiments</h3></div>
              {[
                ['Free gift over 500 MAD', 'Lifts AOV by 15%', '+11% AOV'],
                ['WhatsApp abandoned-cart follow-up', 'Recovers 20% of drop-offs', '18% recovered'],
                ['Bundle skincare routine pack', 'New SKU drives repeat buys', 'starts 8 Jun'],
              ].map(([title, hypothesis, metric]) => (
                <div key={title} className="exp-item"><div className="between mb4"><span className="fw600 fs13">{title}</span><span className="badge green">Running</span></div><div className="fs12 tx-lo mb8">Hypothesis: {hypothesis}</div><span className="badge green">{metric}</span></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </BosShell>
  )
}

function PriorityPanel({ name, avatar, tone, done, items }: { name: string; avatar: string; tone: string; done: string; items: readonly (readonly [string, boolean])[] }) {
  return (
    <div className="panel">
      <div className="panel-head"><div className={`avatar ${tone} small`}>{avatar}</div><h3>{name} - this week</h3><div className="spacer"></div><span className="badge green">{done}</span></div>
      <div className="prio-card">
        {items.map(([title, complete]) => (
          <div key={title} className={`prio-item ${complete ? 'done' : ''}`}><span className={`pbox ${complete ? 'done' : ''}`}>{complete ? <Check /> : null}</span><span className="pt">{title}</span></div>
        ))}
      </div>
    </div>
  )
}
