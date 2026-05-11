Feature: Task Cross Layer Props

  Scenario: executeTaskAndWait merges producer, poller, and task logging ids
    Given I use the "tasksBullMq" config
    And I load the system
    And a task feature is created in the domain "test" with feature "cross-layer-props" that returns cross layer logging ids
    And the task poller is started with logging id "poller-id" set to "poller-1"
    When executeTaskAndWait is called with producer logging id "producer-id" set to "producer-1"
    Then the executeTaskAndWait call should succeed
    And the task result should include logging id "producer-id" set to "producer-1"
    And the task result should include logging id "poller-id" set to "poller-1"
    And the task result should include the generated task id logging entry
