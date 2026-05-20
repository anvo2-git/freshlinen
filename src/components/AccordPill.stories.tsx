import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect } from 'storybook/test'
import { AccordPill } from './AccordPill'

const meta = {
  component: AccordPill,
  tags: ['ai-generated'],
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof AccordPill>

export default meta
type Story = StoryObj<typeof meta>

export const Vanilla: Story = {
  args: {
    accord: 'vanilla',
  },
}

export const Fresh: Story = {
  args: {
    accord: 'fresh',
    large: true,
  },
}

export const Selected: Story = {
  args: {
    accord: 'rose',
    selected: true,
  },
}

export const CssCheck: Story = {
  args: {
    accord: 'vanilla',
  },
  play: async ({ canvas }) => {
    const chip = canvas.getByText('vanilla')
    await expect(getComputedStyle(chip).backgroundColor).toBe('rgb(253, 232, 200)')
    await expect(getComputedStyle(chip).color).toBe('rgb(146, 64, 14)')
  },
}
