import { createTRPCClient, httpBatchLink } from '@trpc/client';
import superjson from 'superjson';

const client = createTRPCClient({
  links: [
    httpBatchLink({
      url: 'http://localhost:3000/api/trpc',
      headers: {
        // Add auth cookie here if needed
      },
    }),
  ],
  transformer: superjson,
});

try {
  const result = await client.admin.debugTransactions.query({ userId: 60003 });
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error('Error:', error.message);
}
