Feature: Execute Task Now

  Scenario: A task is executed immediately without being queued
    Given I load the system
    And a task feature is created in the domain "test" with feature "execute-now"
    When the task feature is called with executeNow set to true
    Then the task should execute synchronously
    And the task status should be marked as "completed"
    And the task result should contain the expected output
