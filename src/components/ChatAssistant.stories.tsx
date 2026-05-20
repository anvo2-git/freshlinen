import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent } from 'storybook/test'
import { ChatAssistant } from './ChatAssistant'

const meta = {
  component: ChatAssistant,
  tags: ['ai-generated'],
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof ChatAssistant>

export default meta
type Story = StoryObj<typeof meta>

export const Home: Story = {
  args: {
    surface: 'home',
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('button', { name: /i'm new/i })).toBeVisible()
    await userEvent.click(await canvas.findByRole('button', { name: /i'm new/i }))
    await expect(await canvas.findByText(/what do you want to smell like/i)).toBeVisible()
  },
}
