from pathlib import Path


def extract_groups(file_path, sample_lines=20):
    groups = {}

    current_group = None
    current_lines = []

    with Path(file_path).open(
        "r",
        encoding="utf-8",
        errors="ignore"
    ) as f:

        for raw_line in f:
            line = raw_line.rstrip()

            if line.startswith("[") and line.endswith("]"):
                if current_group is not None:
                    groups[current_group] = current_lines[:sample_lines]

                current_group = line[1:-1]
                current_lines = []

            elif current_group is not None:
                if line.strip():
                    current_lines.append(line)

    if current_group is not None:
        groups[current_group] = current_lines[:sample_lines]

    return groups

# Do for .sct
groups = extract_groups("WXXX.sct", sample_lines=20)


# Build output
output = []

for group, samples in groups.items():
    output.append(f"\n[{group}]")

    for line in samples:
        output.append(line)


# Save to TXT
output_file = Path("WXXX_sct_samples.txt")

output_file.write_text(
    "\n".join(output),
    encoding="utf-8"
)

print(f"Saved to: {output_file}")

# Do for .ese
groups = extract_groups("WXXX.ese", sample_lines=20)


# Build output
output = []

for group, samples in groups.items():
    output.append(f"\n[{group}]")

    for line in samples:
        output.append(line)


# Save to TXT
output_file = Path("WXXX_ese_samples.txt")

output_file.write_text(
    "\n".join(output),
    encoding="utf-8"
)

print(f"Saved to: {output_file}")