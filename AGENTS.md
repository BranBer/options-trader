<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:mcp-tools -->
# MCP Tools Available via Docker Gateway

## Obsidian Vault
This project has an accompanying Obsidian vault at `Projects/Options Dashboard/` with design docs, architecture notes, and build logs. Use the `mcp_docker_mcp_ga_obsidian_*` tools (search pattern: `obsidian`) to read, search, and update vault files. Available operations:
- `obsidian_list_files_in_dir` / `obsidian_list_files_in_vault` — browse vault structure
- `obsidian_get_file_contents` / `obsidian_batch_get_file_contents` — read notes
- `obsidian_simple_search` / `obsidian_complex_search` — search vault content
- `obsidian_append_content` / `obsidian_patch_content` — update notes
- `obsidian_get_periodic_note` / `obsidian_get_recent_periodic_notes` — daily/weekly notes
- `obsidian_get_recent_changes` — recently modified files
- `obsidian_delete_file` — remove files

When the user references Obsidian notes, vault docs, or project documentation, search for and use these tools.
<!-- END:mcp-tools -->
