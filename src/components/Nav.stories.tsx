import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect } from 'storybook/test'
import { Nav } from './Nav'

const meta = {
  component: Nav,
  tags: ['ai-generated'],
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof Nav>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('link', { name: /library/i })).toBeVisible()
    await expect(canvas.getByRole('button', { name: /sign in/i })).toBeVisible()
  },
}
