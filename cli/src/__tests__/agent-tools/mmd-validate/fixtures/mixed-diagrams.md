# Mixed Mermaid Diagrams Test Fixture

This document contains 8 mermaid diagrams for testing validation.
2 diagrams are intentionally invalid for error handling verification.

## 1. Flowchart (Valid)

```mermaid
flowchart TD
    A[Start] --> B{Is it working?}
    B -->|Yes| C[Great!]
    B -->|No| D[Debug]
    D --> B
    C --> E[End]
```

## 2. Sequence Diagram (Valid)

```mermaid
sequenceDiagram
    participant Client
    participant Server
    participant Database

    Client->>Server: HTTP Request
    Server->>Database: Query
    Database-->>Server: Results
    Server-->>Client: HTTP Response
```

## 3. Class Diagram (Valid)

```mermaid
classDiagram
    class Animal {
        +String name
        +int age
        +makeSound()
    }
    class Dog {
        +String breed
        +bark()
    }
    class Cat {
        +String color
        +meow()
    }
    Animal <|-- Dog
    Animal <|-- Cat
```

## 4. State Diagram (INVALID - missing state name)

```mermaid
stateDiagram-v2
    [*] -->
    Active --> Inactive
    Inactive --> Active
    Active --> [*]
```

## 5. ER Diagram (Valid)

```mermaid
erDiagram
    CUSTOMER ||--o{ ORDER : places
    ORDER ||--|{ LINE_ITEM : contains
    PRODUCT ||--o{ LINE_ITEM : "is in"
    CUSTOMER {
        string name
        string email
    }
    ORDER {
        int orderNumber
        date created
    }
```

## 6. Gantt Chart (Valid)

```mermaid
gantt
    title Project Timeline
    dateFormat  YYYY-MM-DD
    section Planning
    Requirements    :a1, 2024-01-01, 30d
    Design          :a2, after a1, 20d
    section Development
    Implementation  :a3, after a2, 45d
    Testing         :a4, after a3, 15d
```

## 7. Pie Chart (INVALID - malformed syntax)

```mermaid
pie title Pets
    "Dogs" : 45.5
    "Cats" : 30
    "Birds" 10
    "Fish" : 14.5
```

## 8. Mindmap (Valid)

```mermaid
mindmap
    root((Programming))
        Frontend
            HTML
            CSS
            JavaScript
        Backend
            Node.js
            Python
            Go
        Database
            SQL
            NoSQL
```
