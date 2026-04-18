Feature: Database-Configured Task Callbacks

  Scenario: A callback mapping in the database triggers a target task upon source task completion
    Given I load the system
    And a source task feature is created in the domain "test" with feature "source-db-task"
    And a target task feature is created in the domain "test" with feature "target-db-task"
    And a task callback mapping is saved in the database mapping the source to the target
    When the source task feature is called with executeNow set to true
    Then the source task should execute successfully
    And a child task for the target feature should be spawned from the database mapping
    And the child task should have the source task ID as its parentTaskId
    When the child task is processed
    Then the child task should execute successfully
    And the child task status should be marked as "completed"
