import { SWRConfig } from 'swr';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from '../contexts/AuthContext';
import '../styles/globals.css';

export default function App({ Component, pageProps }) {
  const getLayout = Component.getLayout ?? ((page) => page);

  return (
    <SWRConfig value={{
      revalidateOnFocus: false,
      shouldRetryOnError: false,
      onError: (err) => {
        if (err?.response?.status === 401) return;
        console.error('[SWR]', err?.response?.data?.error || err.message);
      },
    }}>
      <AuthProvider>
        {getLayout(<Component {...pageProps} />)}
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: '#101020',
              color: '#f0eef8',
              border: '1px solid #1e1e36',
              fontSize: '13px',
              borderRadius: '10px',
            },
            success: { iconTheme: { primary: '#10d9a0', secondary: '#07070f' } },
            error:   { iconTheme: { primary: '#fb7185', secondary: '#07070f' } },
            duration: 3000,
          }}
        />
      </AuthProvider>
    </SWRConfig>
  );
}
