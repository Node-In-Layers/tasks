Feature: Code-Configured Task Callbacks

  Scenario: A registered code callback is triggered upon task completion
    Given I load the system
    And a source task feature is created in the domain "test" with feature "source-code-task"
    And a target callback feature is registered for the source domain "test" and feature "source-code-task"
    When the source task feature is called with executeNow set to true
    Then the source task should execute successfully
    And a child task for the target callback should be spawned
    And the child task should have the source task ID as its parentTaskId
    When the child task is processed
    Then the child task should execute successfully
    And the child task status should be marked as "completed"
