@{view:mermaid}
```mermaid
flowchart LR
    A[commit] --> B{verify}
    B -->|pass| C[publish]
    B -->|fail| S[stop]
    classDef ok stroke:#2ecc71
    classDef ko stroke:#e74c3c
    class C ok
    class S ko
```
