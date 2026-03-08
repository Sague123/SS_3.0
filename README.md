# SS_3.0 — Sociální síť

Projektová práce: sociální síť s backendem ve Flasku a SQLite.

## Požadavky

- **Python 3** (doporučeno 3.9+)
- **pip**

## Spuštění

1. **Nainstalujte závislosti**
   ```bash
   pip install -r requirements.txt
   ```

2. **Inicializujte databázi** (vytvoří soubor `social_network.db`)
   ```bash
   python database.py
   ```

3. **Spusťte server**
   ```bash
   python app.py
   ```

4. **Otevřete v prohlížeči**
   - [http://localhost:5000](http://localhost:5000) nebo [http://127.0.0.1:5000](http://127.0.0.1:5000)

Aplikace poběží na portu **5000**. Stránky (přihlášení, lenta, profil, zprávy) otevírejte vždy přes tento adresář, aby API fungovalo správně.

## Volitelně: virtuální prostředí

```bash
python -m venv venv
venv\Scripts\activate    # Windows
# nebo: source venv/bin/activate  # Linux/macOS
pip install -r requirements.txt
python database.py
python app.py
```
