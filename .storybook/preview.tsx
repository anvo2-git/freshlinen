import type { Preview } from '@storybook/nextjs-vite'
import '../src/app/globals.css'
import { ClerkProvider } from '@clerk/nextjs'
import { AppProvider } from '../src/lib/context'
import { FavoritesProvider } from '../src/lib/favorites-context'

const preview: Preview = {
  decorators: [
    (Story) => (
      <ClerkProvider publishableKey="pk_test_storybook_local">
        <AppProvider>
          <FavoritesProvider>
            <div className="min-h-screen bg-transparent font-sans text-stone-950">
              <Story />
            </div>
          </FavoritesProvider>
        </AppProvider>
      </ClerkProvider>
    ),
  ],
  async beforeEach() {
    window.localStorage.removeItem('freshlinen:onboarding-choice')
    window.localStorage.removeItem('freshlinen:chat-history')
    window.localStorage.removeItem('freshlinen:saved-recommendations')
    window.sessionStorage.removeItem('freshlinen:onboarding-choice')
    window.sessionStorage.removeItem('freshlinen:chat-history')
    window.sessionStorage.removeItem('freshlinen:saved-recommendations')
  },
  parameters: {
    controls: {
      matchers: {
       color: /(background|color)$/i,
       date: /Date$/i,
      },
    },

    a11y: {
      // 'todo' - show a11y violations in the test UI only
      // 'error' - fail CI on a11y violations
      // 'off' - skip a11y checks entirely
      test: 'todo',
    },
  },
};

export default preview;
