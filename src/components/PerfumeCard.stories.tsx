import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect } from 'storybook/test'
import { PerfumeCard } from './PerfumeCard'
import type { Perfume } from '@/lib/types'

const samplePerfume: Perfume = {
  id: 42,
  n: 'Midnight Amber',
  b: 'Maison Example',
  g: 'for women and men',
  r: 4.5,
  rc: 1234,
  aw: {
    vanilla: 88,
    amber: 82,
    woody: 70,
    musk: 61,
    rose: 42,
    smoky: 31,
  },
}

const meta = {
  component: PerfumeCard,
  tags: ['ai-generated'],
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof PerfumeCard>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    perfume: samplePerfume,
  },
  play: async ({ canvas }) => {
    const link = canvas.getByRole('link', { name: /midnight amber/i })
    await expect(link).toHaveAttribute('href', '/perfume/42')
  },
}

export const WithAction: Story = {
  args: {
    perfume: samplePerfume,
    action: <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-700">Rank #1</span>,
  },
}
