@bullmq
Feature: BullMQ Queue Execution

  Scenario: A task is enqueued and later executed via Redis-backed BullMQ
    Given I use the "tasksBullMq" config
    And I load the system
    And a task feature is created in the domain "test" with feature "bullmq-queued-execution"
    When the task feature is called without executeNow
    Then the task should be added to the queue
    And the task status should be marked as "pending"
    When the task poller processes the queue
    Then the task should execute successfully
    And the task status should be marked as "completed"
    And the task result should contain the expected output
