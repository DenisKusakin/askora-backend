# Askora backend

#### Even though Askora works completely on-chain and could operate without a backend, this module adds two important features

- ## Telegram notifications:
   
   #### Allows users to receive notifications in telegram in case of submitting new question or getting a response

- ## Sponsored transactions

   #### Allows users to perform some actions(such as create an account, reply to a question) without explicitly sending a transaction.
   #### Transactions are sent by the backend on user behalf(using tonproof to verify that wallet actually belongs to the user)
