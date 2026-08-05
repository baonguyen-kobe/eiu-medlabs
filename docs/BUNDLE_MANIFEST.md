# AI Review Bundle Manifest

Gói review bao gồm:

- `app/`: Next.js routes, Server Actions và API template.
- `components/`: dashboard, calendar, form, import và admin UI.
- `lib/`: Supabase client/server helpers và model dùng chung.
- `supabase/`: config, schema, migration, seed và dữ liệu demo.
- `tests/`: kiểm thử tích hợp Supabase.
- `scripts/`: script tạo tài khoản local.
- `docs/`: review brief, UI spec, assumptions và prompt reviewer.
- `public/`: static assets.
- `graphify-out/`: graph, báo cáo và HTML explorer; không gồm cache/backups.
- `project-brief/AI Prompt 2 - Revised.txt`: yêu cầu nghiệp vụ đầy đủ.
- `project-brief/AGENTS.md`: hướng dẫn dùng Graphify.
- Các file cấu hình/build quan trọng ở root dự án.

Gói không bao gồm:

- `node_modules/`
- `.next/`
- `.git/`
- `.env.local`
- Log
- Supabase container/temp data
- Graphify cache và backup
- Tool/venv cài trên máy

Không có production secret hoặc service-role key trong archive.
