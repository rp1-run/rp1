# Mermaid Diagrams Cheat Sheet

A comprehensive reference guide for creating various types of Mermaid diagrams.

## Table of Contents
- [Flowcharts](#flowcharts)
- [Sequence Diagrams](#sequence-diagrams)
- [Class Diagrams](#class-diagrams)
- [State Diagrams](#state-diagrams)
- [Entity Relationship Diagrams](#entity-relationship-diagrams)
- [Gantt Charts](#gantt-charts)
- [Git Graphs](#git-graphs)
- [Pie Charts](#pie-charts)
- [User Journey](#user-journey)
- [Architecture Diagrams](#architecture-diagrams)
- [Timeline](#timeline)
- [Mindmap](#mindmap)
- [Block Diagrams](#block-diagrams)
- [Sankey Diagrams](#sankey-diagrams)
- [ZenUML](#zenuml)
- [Quadrant Charts](#quadrant-charts)
- [XY Charts](#xy-charts)
- [Kanban](#kanban)
- [Radar Charts](#radar-charts)
- [Comments](#comments)

---

## Flowcharts

### Basic Syntax
```mermaid
flowchart LR
    A[Start] --> B{Should you?}
    B -- Yes --> C{{Do it}}
    B -- Maybe --> D[(Save for later)]
    B -- No --> E[Okay]
```

### Directions
- `LR` - Left to Right
- `RL` - Right to Left
- `TB` or `TD` - Top to Bottom
- `BT` - Bottom to Top

### Node Shapes
- `[text]` - Rectangle (default)
- `(text)` - Rounded corners
- `([text])` - Stadium-shaped
- `[[text]]` - Subroutine
- `[(text)]` - Cylindrical
- `((text))` - Circle
- `{text}` - Diamond
- `{{text}}` - Hexagon
- `[/text/]` - Parallelogram
- `[\text\]` - Parallelogram (alt)
- `[/text\]` - Trapezoid
- `[\text/]` - Trapezoid (alt)

### Arrow Types
- `-->` - Solid arrow
- `-.->` - Dotted arrow
- `==>` - Thick arrow
- `--` - Line (no arrow)
- `-- text -->` - Arrow with label

---

## Sequence Diagrams

### Basic Example
```mermaid
sequenceDiagram
    Alice ->>+ Bob: Here's a message!
    Bob ->>- Alice: Hmm, ok, thanks.
```

### Message Types
- `->` - Solid line without arrow
- `-->` - Dotted line without arrow
- `->>` - Solid line with arrow
- `-->>` - Dotted line with arrow
- `-x` - Solid line with x
- `--x` - Dotted line with x
- `-)` - Solid line with open arrow
- `--)` - Dotted line with open arrow

### Activation & Deactivation
```mermaid
sequenceDiagram
    Alice ->>+ Bob: Explicit activation
    activate Bob
    Bob ->> Charlie: Message
    deactivate Bob

    Alice ->>+ Bob: Implicit activation
    Bob ->>- Alice: Implicit deactivation
```

### Control Flow
```mermaid
sequenceDiagram
    Alice ->> Bob: Message

    loop Every minute
        Bob ->> Alice: Status
    end

    opt If condition
        Alice ->> Bob: Optional message
    end

    alt Success
        Bob ->> Alice: Success response
    else Failure
        Bob ->> Alice: Error response
    end

    par Parallel
        Alice ->> Bob: Message 1
    and
        Alice ->> Charlie: Message 2
    end
```

### Notes
```mermaid
sequenceDiagram
    participant Alice
    participant Bob
    note left of Alice: Left note
    note right of Alice: Right note
    note over Alice,Bob: Note spanning both
```

---

## Class Diagrams

### Basic Structure
```mermaid
classDiagram
    class ClassName {
        +String publicAttribute
        -String privateAttribute
        #String protectedAttribute
        ~String packageAttribute
        +publicMethod() ReturnType
        -privateMethod()
        abstractMethod()*
        staticMethod()$
    }
```

### Relationships
```mermaid
classDiagram
    classA --|> classB : Inheritance
    classB --* classC : Composition
    classC --o classD : Aggregation
    classD --> classE : Association
    classF -- classG : Link (Solid)
    classG ..> classH : Dependency
    classH ..|> classI : Realization
    classI .. classJ : Link (Dashed)
```

### Generics
```mermaid
classDiagram
    class ClassName~MyType~ {
        List~MyType~ myList
        withParameter(List~MyType~)
        withReturnType() List~MyType~
    }
```

### Visibility Modifiers
- `+` Public
- `-` Private
- `#` Protected
- `~` Package/Internal
- `*` Abstract
- `$` Static

---

## State Diagrams

### Basic Syntax
```mermaid
stateDiagram-v2
    [*] --> Still
    Still --> Moving : Start moving
    Moving --> Still : Stop moving
    Moving --> Crashed : Accident
    Crashed --> [*]
```

### Composite States
```mermaid
stateDiagram-v2
    [*] --> First

    state First {
        [*] --> a
        a --> b
    }

    First --> Second

    state Second {
        [*] --> c
        c --> d
    }
```

### Concurrency
```mermaid
stateDiagram-v2
    [*] --> Active

    state Active {
        [*] --> NumLockOff
        NumLockOff --> NumLockOn
        --
        [*] --> CapsLockOff
        CapsLockOff --> CapsLockOn
    }
```

### Notes
```mermaid
stateDiagram-v2
    direction LR
    Start --> Middle

    note left of Start
        This is a left note
    end note

    note right of Middle
        This is a right note
    end note
```

---

## Entity Relationship Diagrams

### Basic Structure
```mermaid
erDiagram
    CUSTOMER ||--o{ ORDER : places
    ORDER ||--|{ LINE-ITEM : contains
    CUSTOMER }|..|{ DELIVERY-ADDRESS : uses
```

### Entity Definition
```mermaid
erDiagram
    User {
        Int id PK "Primary key"
        String username "Unique username"
        String email
        Int serverId FK "Foreign key to Server"
    }

    Server {
        Int id PK
        String serverName
    }

    Server ||--o{ User : has
```

### Relationship Cardinality
- `||--||` - Exactly one to exactly one
- `||--o{` - One to zero or more
- `}o--o{` - Zero or more to zero or more
- `}|--|{` - One or more to one or more
- `|o--o|` - Zero or one to zero or one

---

## Gantt Charts

### Basic Syntax
```mermaid
gantt
    title A Gantt Diagram
    dateFormat YYYY-MM-DD
    section Section
        A task          :a1, 2014-01-01, 30d
        Another task    :after a1, 20d
    section Another
        Task in Another :2014-01-12, 12d
        another task    :24d
```

### Advanced Features
```mermaid
gantt
    dateFormat  YYYY-MM-DD
    title Project Timeline
    excludes weekends

    section Planning
    Completed task      :done,    des1, 2024-01-01, 2024-01-05
    Active task         :active,  des2, 2024-01-06, 3d
    Future task         :         des3, after des2, 5d

    section Critical
    Critical task       :crit, done, 2024-01-01, 24h
    Milestone           :milestone, m1, 2024-01-10, 0d
```

### Task States
- `:done` - Completed
- `:active` - Currently active
- `:crit` - Critical task
- `:milestone` - Milestone marker

---

## Git Graphs

### Basic Example
```mermaid
gitGraph:
    commit
    branch develop
    checkout develop
    commit
    commit
    checkout main
    merge develop
    commit
```

### Advanced Features
```mermaid
gitGraph:
    commit id: "Initial"
    branch hotfix
    checkout hotfix
    commit
    branch develop
    checkout develop
    commit id:"Feature" tag:"v1.0"
    checkout main
    merge hotfix
    checkout develop
    commit type:HIGHLIGHT
    branch featureA
    commit
    checkout develop
    merge featureA
```

### Commit Types
- `type:NORMAL` - Regular commit
- `type:REVERSE` - Reverse commit
- `type:HIGHLIGHT` - Highlighted commit

---

## Pie Charts

### Basic Syntax
```mermaid
pie
    title Fruits Distribution
    "Apples" : 50
    "Oranges" : 20
    "Grapes" : 9.99
    "Passionfruits" : 12.5
```

---

## User Journey

### Basic Syntax
```mermaid
journey
    title User Journey
    section Logging in
        Navigate to login: 4: Alice, Bob
        Entering details: 2: Alice
        Pressing button: 5: Alice
    section Using app
        Browse content: 5: Alice, Bob, Craig
        Make purchase: 3: Alice
```

---

## Architecture Diagrams

### Basic Example
```mermaid
architecture-beta
    service db(database)[Database]
    service disk1(disk)[Storage]
    service server(server)[Server]

    db:L <-- R:server
    disk1:T -- B:server
```

### With Groups
```mermaid
architecture-beta
    group cloud[Cloud Infrastructure]
    group onprem[On-Premise] in cloud

    service db(database)[Database] in onprem
    service server(server)[Server] in cloud

    db:L <-- R:server
```

### Service Icons
- `cloud` - Cloud service
- `database` - Database
- `disk` - Storage disk
- `internet` - Internet
- `server` - Server

---

## Timeline

### Basic Syntax
```mermaid
timeline
    title Timeline of Events
    2001: Something happened
    2002: Something else happened
          : Multiple events
    2003: Another event
```

---

## Mindmap

### Basic Syntax
```mermaid
mindmap
    root((Central Idea))
        Topic 1
            Subtopic A
            Subtopic B
        Topic 2
            Subtopic C
                Detail 1
                Detail 2
        Topic 3
```

---

## Block Diagrams

### Basic Structure
```mermaid
block-beta
    columns 3
    a b c
    d e f
```

### With Shapes
```mermaid
block-beta
    columns 4
    a["default"]
    b("rounded")
    c[["double-edged"]]
    d{{"hexagon"}}
```

### Nested Blocks
```mermaid
block-beta
    columns 5
    a:3 b:2
    block:myBlock:2
        columns 2
        i j k
    end
```

### Connections
```mermaid
block-beta
    columns 3
    a space b
    c

    a-->b
    b--"label"-->c
```

---

## Sankey Diagrams

### Basic Syntax
```mermaid
sankey-beta
    BlockA,SubblockA,100
    BlockA,SubblockB,50
    SubblockA,FinalBlock,70
    SubblockB,FinalBlock,50
```

---

## ZenUML

### Basic Sequence
```mermaid
zenuml
    title Demo
    Alice->John: Hello John
    John->Alice: Great!
```

### Message Types
```mermaid
zenuml
    User->Server.SyncMessage
    User->Server.SyncWithResult { return result }
    User->Server: AsyncMessage
    new CreateMessage
    @return Server->User: ReplyMessage
```

### Control Flow
```mermaid
zenuml
    User->Server: Request

    if (condition) {
        Server->User: Response1
    } else {
        Server->User: Response2
    }

    while(condition) {
        Server->User: Repeated message
    }

    try {
        User->Server: Risky operation
    } catch {
        Server->User: Error
    } finally {
        Server->User: Cleanup
    }
```

---

## Quadrant Charts

### Basic Syntax
```mermaid
quadrantChart
    title Product Analysis
    x-axis Low Cost --> High Cost
    y-axis Low Quality --> High Quality
    quadrant-1 Premium Products
    quadrant-2 Overpriced
    quadrant-3 Budget Options
    quadrant-4 Good Value
    Product A: [0.3, 0.6]
    Product B: [0.7, 0.8]
    Product C: [0.2, 0.2]
```

---

## XY Charts

### Basic Syntax
```mermaid
xychart-beta
    title "Sales Data"
    x-axis [Jan, Feb, Mar, Apr, May]
    y-axis "Revenue" 0 --> 10000
    bar [5000, 6000, 7500, 8000, 9500]
    line [4500, 5800, 7200, 7800, 9200]
```

---

## Kanban

### Basic Syntax
```mermaid
kanban
    Todo
        Task A
        Task B@{ priority: 'High' }
    In Progress
        Task C@{ assigned: 'Alice' }
    Done
        Task D@{ ticket: 'ABC-123' }
```

### Metadata Options
```mermaid
kanban
    Backlog
        Task A@{ ticket: ABC-123, assigned: 'Alice', priority: 'High' }

    All Priorities
        Very High@{ priority: 'Very High' }
        High@{ priority: 'High' }
        Normal
        Low@{ priority: 'Low' }
        Very Low@{ priority: 'Very Low' }
```

---

## Radar Charts

### Basic Syntax
```mermaid
radar-beta
    title Skill Levels
    axis Programming, Design, Testing, Documentation, Communication
    curve Developer1{80, 60, 70, 50, 65}
    curve Developer2{70, 80, 60, 70, 75}
```

---

## Comments

Comments can be added to any diagram using `%%`:

```mermaid
flowchart LR
    %% This is a comment
    A --> B
    %% Comments are ignored during rendering
    B --> C
```

For sequence diagrams:
```mermaid
sequenceDiagram
    %% Define participants
    participant Alice
    participant Bob

    Alice ->> Bob: Message
    %% More interactions here
```

---

## Common Patterns

### Direction Control
Most diagrams support direction:
```mermaid
flowchart TB  %% Top to Bottom
classDiagram
    direction LR  %% Left to Right
stateDiagram-v2
    direction RL  %% Right to Left
```

### Styling with Classes
```mermaid
classDiagram
    class MyClass {
        +attribute
    }

    class AnotherClass

    MyClass --|> AnotherClass

    class MyClass cssClass1
    class AnotherClass cssClass2
```

### Accessibility
Add titles and descriptions:
```mermaid
stateDiagram-v2
    accTitle: This is the accessible title
    accDescr: This is an accessible description

    [*] --> State1
```

---

## Tips for Creating Valid Diagrams

1. **Always start with the diagram type** (`flowchart`, `sequenceDiagram`, `classDiagram`, etc.)
2. **Use consistent indentation** for readability
3. **Quote labels with special characters** or spaces: `A["Label with spaces"]`
4. **Escape special characters** if needed
5. **Use semicolons carefully** - some diagram types require them, others don't
6. **Test arrows syntax** - different diagrams use different arrow styles
7. **Check cardinality notation** in ER diagrams - symbols matter
8. **Use comments** (`%%`) to document complex diagrams

---

## Validation

To validate a Mermaid diagram:

```bash
# Single diagram validation
printf 'graph TD; A-->B' | npx -y @mermaid-js/mermaid-cli@latest -i /dev/stdin -o /tmp/_.svg 2>&1 | grep -A2 -m1 '^Error:' && false || true
```

Common issues:
- Invalid node syntax
- Missing semicolons or line breaks
- Invalid arrow types for the diagram type
- Malformed relationships or cardinality notation
- Invalid style/class definitions
