Feature: Queued Task Execution

  Scenario: A task is enqueued and later executed by a poller
    Given I load the system
    And a task feature is created in the domain "test" with feature "queued-execution"
    When the task feature is called without executeNow
    Then the task should be added to the queue
    And the task status should be marked as "pending"
    When the task poller processes the queue
    Then the task should execute successfully
    And the task status should be marked as "completed"
    And the task result should contain the expected output
