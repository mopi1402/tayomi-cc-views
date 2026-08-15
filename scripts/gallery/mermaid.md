@{view:mermaid}
```mermaid
flowchart LR
    A[commit] --> B{lint}
    B -->|pass| C[test]
    B -->|fail| S[stop]
    C --> D[pack]
    D --> E[publish]
```
