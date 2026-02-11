"use client";

import { useState, useEffect } from "react";
import { useBackendQuery, useBackendMutation } from "@/hooks/networking";

interface UserCredit {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  token_balance: number;
  monthly_credit_limit: number;
  current_month_usage: number;
  bonus_credits: number;
  is_active: boolean;
  usage_reset_date: string | null;
  created_at: string | null;
  updated_at: string | null;
}

interface Transaction {
  id: number;
  user_id: number;
  username: string;
  amount: number;
  transaction_type: string;
  description: string;
  created_at: string;
}

export function AdminCredits() {
  const [selectedUser, setSelectedUser] = useState<UserCredit | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showSubtractModal, setShowSubtractModal] = useState(false);
  const [showTransactionsModal, setShowTransactionsModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filteredUsers, setFilteredUsers] = useState<UserCredit[]>([]);

  const { data: users, isLoading, refetch } = useBackendQuery<UserCredit[]>(
    "admin/credits/",
    "GET",
    { shouldCacheResponse: false }
  );

  const { data: transactions, refetch: refetchTransactions, isLoading: loadingTransactions, error: transactionsError } = useBackendQuery<Transaction[]>(
    `admin/credits/transactions/?user_id=${selectedUser?.id || ''}`,
    "GET",
    { 
      shouldCacheResponse: false,
      enabled: showTransactionsModal && !!selectedUser
    }
  );

  // Trigger refetch when modal opens
  useEffect(() => {
    if (showTransactionsModal && selectedUser) {
      refetchTransactions();
    }
  }, [showTransactionsModal, selectedUser, refetchTransactions]);

  const addCreditsMutation = useBackendMutation<
    { user_id: number; amount: number; description: string },
    { message: string; new_balance: number }
  >(
    "admin/credits/add/",
    "POST",
    { shouldCacheResponse: false }
  );

  const subtractCreditsMutation = useBackendMutation<
    { user_id: number; amount: number; description: string },
    { message: string; new_balance: number }
  >(
    "admin/credits/subtract/",
    "POST",
    { shouldCacheResponse: false }
  );

  // Filter users based on search query
  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (!users) return;
    
    const filtered = users.filter(user => 
      user.username.toLowerCase().includes(query.toLowerCase()) ||
      user.email.toLowerCase().includes(query.toLowerCase()) ||
      `${user.first_name} ${user.last_name}`.toLowerCase().includes(query.toLowerCase())
    );
    setFilteredUsers(filtered);
  };

  const handleAddCredits = async (amount: number, description: string) => {
    if (!selectedUser) return;

    try {
      await addCreditsMutation.mutateAsync({
        user_id: selectedUser.id,
        amount: amount,
        description: description
      });
      setShowAddModal(false);
      setSelectedUser(null);
      refetch();
    } catch (error) {
      console.error("Failed to add credits:", error);
    }
  };

  const handleSubtractCredits = async (amount: number, description: string) => {
    if (!selectedUser) return;

    try {
      await subtractCreditsMutation.mutateAsync({
        user_id: selectedUser.id,
        amount: amount,
        description: description
      });
      setShowSubtractModal(false);
      setSelectedUser(null);
      refetch();
    } catch (error) {
      console.error("Failed to subtract credits:", error);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (!users) {
    return (
      <div className="p-6">
        <div className="text-center text-gray-500">
          Failed to load credits data
        </div>
      </div>
    );
  }

  const displayUsers = searchQuery ? filteredUsers : users;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Credit Management</h2>
        <div className="flex space-x-3">
          <button
            onClick={() => refetch()}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="mb-6">
        <input
          type="text"
          placeholder="Search users by username, email, or name..."
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      {/* Credits Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  User
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Balance
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Monthly Limit
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Usage
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {displayUsers.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {user.username}
                      </div>
                      <div className="text-sm text-gray-500">
                        {user.email}
                      </div>
                      <div className="text-xs text-gray-400">
                        {user.first_name} {user.last_name}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {user.token_balance.toFixed(1)} credits
                    </div>
                    {user.bonus_credits > 0 && (
                      <div className="text-xs text-green-600">
                        +{user.bonus_credits.toFixed(1)} bonus
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {user.monthly_credit_limit.toFixed(1)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {user.current_month_usage.toFixed(1)}
                    </div>
                    <div className="text-xs text-gray-500">
                      {user.usage_reset_date ? `Resets: ${new Date(user.usage_reset_date).toLocaleDateString()}` : 'No reset date'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      user.is_active 
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {user.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                    <button
                      onClick={() => {
                        setSelectedUser(user);
                        setShowAddModal(true);
                      }}
                      className="text-green-600 hover:text-green-900"
                    >
                      Add
                    </button>
                    <button
                      onClick={() => {
                        setSelectedUser(user);
                        setShowSubtractModal(true);
                      }}
                      className="text-red-600 hover:text-red-900"
                    >
                      Subtract
                    </button>
                    <button
                      onClick={() => {
                        setSelectedUser(user);
                        setShowTransactionsModal(true);
                      }}
                      className="text-blue-600 hover:text-blue-900"
                    >
                      History
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Credits Modal */}
      {showAddModal && selectedUser && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Add Credits to {selectedUser.username}
              </h3>
              
              <form onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                const amount = parseFloat(formData.get('amount') as string);
                const description = formData.get('description') as string;
                if (amount > 0) {
                  handleAddCredits(amount, description);
                }
              }}>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Amount:
                    </label>
                    <input
                      type="number"
                      name="amount"
                      step="0.1"
                      min="0.1"
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Enter amount"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Description:
                    </label>
                    <textarea
                      name="description"
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Enter description"
                      defaultValue="Credits added by admin"
                    />
                  </div>
                </div>
                
                <div className="mt-6 flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddModal(false);
                      setSelectedUser(null);
                    }}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={addCreditsMutation.isPending}
                    className="px-4 py-2 text-sm font-medium text-white bg-green-600 border border-transparent rounded-md hover:bg-green-700 disabled:opacity-50"
                  >
                    {addCreditsMutation.isPending ? "Adding..." : "Add Credits"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Subtract Credits Modal */}
      {showSubtractModal && selectedUser && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Subtract Credits from {selectedUser.username}
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                Current balance: {selectedUser.token_balance.toFixed(1)} credits
              </p>
              
              <form onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                const amount = parseFloat(formData.get('amount') as string);
                const description = formData.get('description') as string;
                if (amount > 0 && amount <= selectedUser.token_balance) {
                  handleSubtractCredits(amount, description);
                }
              }}>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Amount:
                    </label>
                    <input
                      type="number"
                      name="amount"
                      step="0.1"
                      min="0.1"
                      max={selectedUser.token_balance}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Enter amount"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Description:
                    </label>
                    <textarea
                      name="description"
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Enter description"
                      defaultValue="Credits subtracted by admin"
                    />
                  </div>
                </div>
                
                <div className="mt-6 flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowSubtractModal(false);
                      setSelectedUser(null);
                    }}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={subtractCreditsMutation.isPending}
                    className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 disabled:opacity-50"
                  >
                    {subtractCreditsMutation.isPending ? "Subtracting..." : "Subtract Credits"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Transaction History Modal */}
      {showTransactionsModal && selectedUser && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-6xl max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex-shrink-0">
              <h3 className="text-lg font-medium text-gray-900">
                Transaction History for {selectedUser.username}
              </h3>
            </div>
            
            {/* Modal Content - Scrollable */}
            <div className="flex-1 overflow-y-auto">
              <div className="bg-white border border-gray-200 rounded-lg">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Date
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Type
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Amount
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Description
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {loadingTransactions ? (
                          <tr>
                            <td colSpan={4} className="px-6 py-4 text-center text-gray-500">
                              Loading transactions...
                            </td>
                          </tr>
                        ) : transactionsError ? (
                          <tr>
                            <td colSpan={4} className="px-6 py-4 text-center text-red-500">
                              Error loading transactions. Please try again.
                            </td>
                          </tr>
                        ) : transactions && transactions.length > 0 ? (
                          transactions.map((transaction) => (
                            <tr key={transaction.id} className="hover:bg-gray-50">
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                {new Date(transaction.created_at).toLocaleString()}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                  transaction.transaction_type === 'credit' 
                                    ? 'bg-green-100 text-green-800'
                                    : transaction.transaction_type === 'debit'
                                    ? 'bg-red-100 text-red-800'
                                    : 'bg-blue-100 text-blue-800'
                                }`}>
                                  {transaction.transaction_type}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                {transaction.amount > 0 ? '+' : ''}{transaction.amount.toFixed(1)}
                              </td>
                              <td className="px-6 py-4 text-sm text-gray-900">
                                {transaction.description}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={4} className="px-6 py-4 text-center text-gray-500">
                              No transactions found
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                </div>
              </div>
            </div>
            
            {/* Modal Footer - Always Visible */}
            <div className="px-6 py-4 border-t border-gray-200 flex-shrink-0">
              <div className="flex justify-end">
                <button
                  onClick={() => {
                    setShowTransactionsModal(false);
                    setSelectedUser(null);
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
