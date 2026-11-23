-- Seed Standard Market Instruments
INSERT INTO instruments (symbol, name, category, contract_size, tick_size, tick_value, point_value, base_currency, quote_currency)
VALUES
    ('XAUUSD', 'Gold / US Dollar', 'metals', 100.0, 0.01, 1.0, 100.0, 'XAU', 'USD'),
    ('US30', 'Dow Jones Industrial Average 30', 'indices', 1.0, 1.0, 1.0, 1.0, 'USD', 'USD'),
    ('US500', 'S&P 500 Index', 'indices', 1.0, 0.1, 0.1, 1.0, 'USD', 'USD'),
    ('NAS100', 'Nasdaq 100 Index', 'indices', 1.0, 0.25, 0.25, 1.0, 'USD', 'USD'),
    ('EURUSD', 'Euro / US Dollar', 'forex', 100000.0, 0.00001, 1.0, 100000.0, 'EUR', 'USD'),
    ('GBPUSD', 'British Pound / US Dollar', 'forex', 100000.0, 0.00001, 1.0, 100000.0, 'GBP', 'USD'),
    ('USDJPY', 'US Dollar / Japanese Yen', 'forex', 100000.0, 0.001, 0.67, 1000.0, 'USD', 'JPY'),
    ('BTCUSD', 'Bitcoin / US Dollar', 'crypto', 1.0, 0.1, 0.1, 1.0, 'BTC', 'USD'),
    ('ETHUSD', 'Ethereum / US Dollar', 'crypto', 1.0, 0.01, 0.01, 1.0, 'ETH', 'USD'),
    ('USOIL', 'WTI Crude Oil', 'commodities', 1000.0, 0.01, 10.0, 1000.0, 'USD', 'USD')
ON CONFLICT (symbol) DO NOTHING;
