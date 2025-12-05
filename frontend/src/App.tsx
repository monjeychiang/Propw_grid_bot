import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import { ToastProvider } from './components/Toast';
import OrdersPage from './pages/OrdersPage';
import StrategiesPage from './pages/StrategiesPage';
import StrategyDetailPage from './pages/StrategyDetailPage';
import DocsPage from './pages/DocsPage';

function App() {
    return (
        <ToastProvider>
            <Router>
                <Layout>
                    <Routes>
                        <Route path="/" element={<StrategiesPage />} />
                        <Route path="/orders" element={<OrdersPage />} />
                        <Route path="/strategies" element={<StrategiesPage />} />
                        <Route path="/strategies/:id" element={<StrategyDetailPage />} />
                        <Route path="/docs" element={<DocsPage />} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                </Layout>
            </Router>
        </ToastProvider>
    );
}

export default App;
